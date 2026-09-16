import EventEmitter from 'node:events';
import {
	BeanstalkCommand,
	BeanstalkJobState,
	BeanstalkResponseStatus,
	type IBeanstalkJobStats,
	type IBeanstalkStats,
	type IBeanstalkTubeStats,
	type IClientCtorOptions,
	type IClientRawReservedJob,
	type Serializer,
	type ICommandHandledResponse,
	type ICommandResponse,
	type ICommandResponseHeaders,
} from './types.js';
import {type Command} from './command.js';
import {ClientError, ClientErrorCode} from './error/client-error.js';
import {getCommandInstance} from './util/get-command-instance.js';
import {DEFAULT_CLIENT_OPTIONS} from './const.js';
import {parseNumericHeader, parseResponseHeaders} from './util/parse-response-headers.js';
import {BeanstalkError} from './error/beanstalk-error.js';
import {
	validateBound,
	validateDelay,
	validateJobId,
	validatePriority,
	validateTimeout,
	validateTTR,
	validateTubeName,
} from './util/validator.js';
import {Connection} from './connection.js';
import {type ILinkedListNode, LinkedList} from './util/linked-list.js';

const DISPLACED_BY_FORCED_DISCONNECT: string = ClientErrorCode.ErrDisconnecting;

export type IClientEvents = {
	connect: [];
	close: [];
	error: [err: Error];
};

export class Client<Events extends Record<keyof Events, unknown[]> = Record<never, never>> extends EventEmitter<
	Events & IClientEvents
> {
	readonly #conn: Connection;

	readonly #opt: Omit<Required<IClientCtorOptions>, 'serializer'> & {serializer: Serializer | undefined};

	readonly #queue = new LinkedList<{
		resolve: () => void;
		reject: (err?: Error) => void;
	}>();

	#disconnecting: Promise<void> | undefined;

	constructor(options: IClientCtorOptions = {}, connection = new Connection()) {
		super();

		this.#opt = {
			...DEFAULT_CLIENT_OPTIONS,
			...options,
		};

		this.#conn = connection;

		connection.on('close', () => {
			this.lifecycle.emit('close');
		});
		connection.on('error', (error) => {
			this.lifecycle.emit('error', error);
		});
	}

	/**
	 * The emitter viewed as the carrier of {IClientEvents} alone. `Events & IClientEvents` cannot be indexed while
	 * `Events` is still generic, so every emit of a connection event goes through this view.
	 */
	private get lifecycle(): EventEmitter<IClientEvents> {
		return this;
	}

	/**
	 * Indicates whether client is waiting for server response.
	 */
	get isWorking(): boolean {
		return this.#queue.size > 0;
	}

	/**
	 * Amount of requests waiting in queue, including connect and disconnect.
	 */
	get queueSize(): number {
		return this.#queue.size;
	}

	/**
	 * Indicates whether client is connected to the server.
	 */
	get isConnected(): boolean {
		return this.#conn.getState() === 'open';
	}

	/**
	 * Disconnects the client if it is connected, so `await using` closes the connection on scope exit. A disconnect
	 * that is already in flight is awaited instead of queued again.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		if (this.#disconnecting) {
			await this.followDisconnect(this.#disconnecting, this.#disconnecting);
			return;
		}

		if (!this.isConnected) return;

		const own = this.disconnect();

		await this.followDisconnect(own, this.#disconnecting);
	}

	/**
	 * Awaits a disconnect, moving on to a forced one that supersedes it instead of failing with the superseded call's
	 * rejection. A forced disconnect rejects the calls it displaces with ErrDisconnecting, which is how a superseded
	 * disconnect is told apart from one that failed. `tracked` is the promise `#disconnecting` held for that disconnect.
	 */
	private async followDisconnect(followed: Promise<void>, tracked: Promise<void> | undefined): Promise<void> {
		try {
			await followed;
		} catch (error) {
			const successor = this.#disconnecting;
			const displaced = error instanceof ClientError && error.code === DISPLACED_BY_FORCED_DISCONNECT;
			const superseded = displaced && successor !== undefined && successor !== tracked;

			if (!superseded) throw error;

			await this.followDisconnect(successor, successor);
		}
	}

	/**
	 * Establish connection to the server
	 *
	 * @category Client
	 */
	public async connect(): Promise<void> {
		if (this.#conn.getState() !== 'closed') {
			throw new ClientError(
				ClientErrorCode.ErrConnectionNotClosed,
				`Unable to open non-closed connection, current state: ${this.#conn.getState()}`,
			);
		}

		const [waitPromise, moveQueue] = this.waitQueue();

		try {
			await waitPromise;

			await this.#conn.open(this.#opt.port, this.#opt.host);

			this.lifecycle.emit('connect');
		} finally {
			moveQueue();
		}
	}

	/**
	 * Disconnect the client from server after all pending requests performed.
	 *
	 * If {force} set to truthy value - only currently running request will be awaited.
	 *
	 * A disconnect whose turn comes after another one already closed the connection resolves without closing again.
	 *
	 * @category Client
	 */
	public async disconnect(force = false): Promise<void> {
		if (this.#conn.getState() !== 'open') {
			throw new ClientError(
				ClientErrorCode.ErrConnectionNotOpened,
				`Unable to close non-opened connection, current state: ${this.#conn.getState()}`,
			);
		}

		const disconnecting = this.closeAfterQueue(force);
		this.#disconnecting = disconnecting;

		try {
			await disconnecting;
		} finally {
			if (this.#disconnecting === disconnecting) this.#disconnecting = undefined;
		}
	}

	private async closeAfterQueue(force: boolean): Promise<void> {
		if (force) {
			// The thing is to empty whole queue and return head node to the list.
			// As head node representing currently running request we want to await it
			// even if force disconnecting.
			const {head} = this.#queue;

			for (const {reject} of this.#queue.truncate()) {
				if (reject === head?.value.reject) continue;
				reject(new ClientError(ClientErrorCode.ErrDisconnecting, 'Client is disconnecting'));
			}

			if (head) this.#queue.pushNode(head);
		}

		const [waitPromise, moveQueue] = this.waitQueue();

		try {
			await waitPromise;

			if (this.#conn.getState() !== 'open') return;

			await this.#conn.close();
		} finally {
			moveQueue();
		}
	}

	// COMMANDS
	/**
	 * Subsequent put commands will put jobs into the tube specified by this command. If no use
	 * command has been issued, jobs will be put into the tube named "default".
	 *
	 * @category Producer Commands
	 */
	public async use(tubeName: string): Promise<string> {
		validateTubeName(tubeName);

		const cmd = getCommandInstance(BeanstalkCommand.use);

		const result = await this.dispatchCommand(cmd, [tubeName]);

		return result.headers[0];
	}

	/**
	 * This command for any process that wants to insert a job into the queue.
	 *
	 * @param payload - Payload of the job. Non string or integer values will be serialized with
	 * [[IClientCtorOptions.serializer]]. Byte size of payload should not exceed server's
	 * max-job-size (default: 2**16) nor client's [[IClientCtorOptions.maxPayloadSize]].
	 *
	 * @param ttr - Time to run -- is an integer number of seconds to allow a worker
	 * to run this job. This time is counted from the moment a worker reserves
	 * this job. If the worker does not delete, release, or bury the job within
	 * <ttr> seconds, the job will time out and the server will release the job.
	 * The minimum ttr is 1. Maximum ttr is 2**32-1.
	 *
	 * @param priority - Integer < 2**32. Jobs with smaller priority values will be
	 * scheduled before jobs with larger priorities. The most urgent priority is 0;
	 * the least urgent priority is 4,294,967,295.
	 *
	 * @param delay - Integer number of seconds to wait before putting the job in
	 * the ready queue. The job will be in the "delayed" state during this time.
	 * Maximum delay is 2**32-1.
	 *
	 * @category Producer Commands
	 */
	public async put(
		payload: any,
		ttr: number = this.#opt.defaultTTR,
		priority: number = this.#opt.defaultPriority,
		delay: number = this.#opt.defaultDelay,
	): Promise<{
		id: number;
		state: BeanstalkJobState.buried | BeanstalkJobState.ready | BeanstalkJobState.delayed;
	}> {
		validateTTR(ttr);
		validatePriority(priority);
		validateDelay(delay);

		if (payload === undefined) {
			throw new TypeError(`payload has to be a non-undefined value`);
		}

		const cmd = getCommandInstance(BeanstalkCommand.put);

		const result = await this.dispatchCommand(cmd, [`${priority}`, `${delay}`, `${ttr}`], payload);

		if (result.status === BeanstalkResponseStatus.JOB_TOO_BIG) {
			throw new BeanstalkError(`Provided job payload exceeds maximal server's 'max-job-size' config`, result.status);
		}

		if (result.status === BeanstalkResponseStatus.EXPECTED_CRLF) {
			throw new BeanstalkError(`Missing trailing CRLF`, result.status);
		}

		if (result.status === BeanstalkResponseStatus.DRAINING) {
			throw new BeanstalkError(`Server is in 'drain mode' and no longer accepting new jobs.`, result.status);
		}

		const state = delay === 0 ? BeanstalkJobState.ready : BeanstalkJobState.delayed;

		return {
			id: parseNumericHeader(result.headers[0]),
			state: result.status === BeanstalkResponseStatus.BURIED ? BeanstalkJobState.buried : state,
		};
	}

	/**
	 * This will return a newly-reserved job. If no job is available to be reserved,
	 * beanstalkd will wait to send a response until one becomes available. Once a
	 * job is reserved for the client, the client has limited time to run (TTR) the
	 * job before the job times out. When the job times out, the server will put the
	 * job back into the ready queue. Both the TTR and the actual time left can be
	 * found in response to the [[Client.statsJob]] command.
	 *
	 * If more than one job is ready, beanstalkd will choose the one with the
	 * smallest priority value. Within each priority, it will choose the one that
	 * was received first.
	 *
	 * During the TTR of a reserved job, the last second is kept by the server as a
	 * safety margin, during which the client will not be made to wait for another
	 * job. If the client issues a reserve command during the safety margin, or if
	 * the safety margin arrives while the client is waiting on a reserve command,
	 * the server will respond with: DEADLINE_SOON
	 *
	 * This gives the client a chance to delete or release its reserved job before
	 * the server automatically releases it.
	 *
	 * @category Worker Commands
	 */
	public async reserve(): Promise<null | IClientRawReservedJob> {
		const cmd = getCommandInstance(BeanstalkCommand.reserve);

		const result = await this.dispatchCommand(cmd);

		if (result.status === BeanstalkResponseStatus.TIMED_OUT) {
			return null;
		}

		if (result.status === BeanstalkResponseStatus.DEADLINE_SOON) {
			throw new BeanstalkError(
				'One of jobs reserved by this client will reach deadline soon, release it first.',
				result.status,
			);
		}

		return {
			id: parseNumericHeader(result.headers[0]),
			payload: result.data,
		};
	}

	/**
	 * Same as [[Client.reserve]] but with limited amount of time to wait for the job.
	 *
	 * A timeout value of 0 will cause the server to immediately return either a
	 * response or TIMED_OUT. A positive value of timeout will limit the amount of
	 * time the client will block on the reserve request until a job becomes
	 * available.
	 *
	 * @category Worker Commands
	 */
	public async reserveWithTimeout(timeout: number): Promise<null | IClientRawReservedJob> {
		validateTimeout(timeout);

		const cmd = getCommandInstance(BeanstalkCommand['reserve-with-timeout']);

		const result = await this.dispatchCommand(cmd, [`${timeout}`]);

		if (result.status === BeanstalkResponseStatus.TIMED_OUT) {
			return null;
		}

		if (result.status === BeanstalkResponseStatus.DEADLINE_SOON) {
			throw new BeanstalkError(
				'One of jobs reserved by this client will reach deadline soon, release it first.',
				result.status,
			);
		}

		return {
			id: parseNumericHeader(result.headers[0]),
			payload: result.data,
		};
	}

	/**
	 * A job can be reserved by its id. Once a job is reserved for the client,
	 * the client has limited time to run (TTR) the job before the job times out.
	 * When the job times out, the server will put the job back into the ready queue.
	 *
	 * @param jobId - integer id of the job.
	 * @category Worker Commands
	 */
	public async reserveJob(jobId: number): Promise<null | IClientRawReservedJob> {
		validateJobId(jobId);

		const cmd = getCommandInstance(BeanstalkCommand['reserve-job']);

		const result = await this.dispatchCommand(cmd, [`${jobId}`]);

		if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
			return null;
		}

		return {
			id: parseNumericHeader(result.headers[0]),
			payload: result.data,
		};
	}

	/**
	 * The delete command removes a job from the server entirely. It is normally used
	 * by the client when the job has successfully run to completion. A client can
	 * delete jobs that it has reserved, ready jobs, delayed jobs, and jobs that are
	 * buried.
	 *
	 * @param jobId - integer id of the job.
	 * @category Worker Commands
	 */
	public async delete(jobId: number): Promise<boolean> {
		validateJobId(jobId);

		const cmd = getCommandInstance(BeanstalkCommand.delete);

		const result = await this.dispatchCommand(cmd, [`${jobId}`]);

		return result.status === BeanstalkResponseStatus.DELETED;
	}

	/**
	 * The release command puts a reserved job back into the ready queue (and marks
	 * its state as "ready") to be run by any client. It is normally used when the job
	 * fails because of a transitory error.
	 *
	 * @param jobId - integer id of the job to release.
	 * @param priority - a new priority to assign to the job.
	 * @param delay - integer number of seconds to wait before putting the job in
	 * the ready queue. The job will be in the "delayed" state during this time.
	 *
	 * @category Worker Commands
	 */
	public async release(
		jobId: number,
		priority: number = this.#opt.defaultPriority,
		delay: number = this.#opt.defaultDelay,
	): Promise<null | BeanstalkJobState.buried | BeanstalkJobState.ready | BeanstalkJobState.delayed> {
		validateJobId(jobId);
		validatePriority(priority);
		validateDelay(delay);

		const cmd = getCommandInstance(BeanstalkCommand.release);

		const result = await this.dispatchCommand(cmd, [`${jobId}`, `${priority}`, `${delay}`]);

		if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
			return null;
		}

		if (result.status === BeanstalkResponseStatus.BURIED) {
			return BeanstalkJobState.buried;
		}

		return delay === 0 ? BeanstalkJobState.ready : BeanstalkJobState.delayed;
	}

	/**
	 * The bury command puts a job into the "buried" state. Buried jobs are put into a
	 * FIFO linked list and will not be touched by the server again until a client
	 * kicks them with the [[Client.kick]] command
	 *
	 * @param jobId - integer id of the job to bury.
	 * @param priority - a new priority to assign to the job.
	 *
	 * @category Worker Commands
	 */
	public async bury(jobId: number, priority: number = this.#opt.defaultPriority): Promise<boolean> {
		validateJobId(jobId);
		validatePriority(priority);

		const cmd = getCommandInstance(BeanstalkCommand.bury);

		const result = await this.dispatchCommand(cmd, [`${jobId}`, `${priority}`]);

		return result.status === BeanstalkResponseStatus.BURIED;
	}

	/**
	 * The "touch" command allows a worker to request more time to work on a job.
	 * This is useful for jobs that potentially take a long time, but you still want
	 * the benefits of a TTR pulling a job away from an unresponsive worker.  A worker
	 * may periodically tell the server that it's still alive and processing a job
	 * (e.g. it may do this on DEADLINE_SOON). The command postpones the auto
	 * release of a reserved job until TTR seconds from when the command is issued
	 *
	 * @param jobId - integer id of the job.
	 * @category Worker Commands
	 */
	public async touch(jobId: number): Promise<boolean> {
		validateJobId(jobId);

		const cmd = getCommandInstance(BeanstalkCommand.touch);

		const result = await this.dispatchCommand(cmd, [`${jobId}`]);

		return result.status === BeanstalkResponseStatus.TOUCHED;
	}

	/**
	 * The "watch" command adds the named tube to the watch list for the current
	 * connection. A reserve command will take a job from any of the tubes in the
	 * watch list. For each new connection, the watch list initially consists of one
	 * tube, named "default".
	 *
	 * @category Worker Commands
	 */
	public async watch(tubeName: string): Promise<number> {
		validateTubeName(tubeName);

		const cmd = getCommandInstance(BeanstalkCommand.watch);

		const result = await this.dispatchCommand(cmd, [tubeName]);

		return parseNumericHeader(result.headers[0]);
	}

	/**
	 * Removes the named tube from the watch list for the current connection.
	 *
	 * False returned in case of attempt to ignore last tube watched
	 * (`NOT_IGNORED` returned from server).
	 *
	 * @category Worker Commands
	 */
	public async ignore(tubeName: string): Promise<boolean> {
		validateTubeName(tubeName);

		const cmd = getCommandInstance(BeanstalkCommand.ignore);

		const result = await this.dispatchCommand(cmd, [tubeName]);

		if (result.status === BeanstalkResponseStatus.WATCHING) {
			parseNumericHeader(result.headers[0]);

			return true;
		}

		return false;
	}

	/**
	 * Inspect a job with given ID without reserving it.
	 *
	 * @param jobId - integer id of the job.
	 * @category Other Commands
	 */
	public async peek(jobId: number): Promise<null | IClientRawReservedJob> {
		validateJobId(jobId);

		const cmd = getCommandInstance(BeanstalkCommand.peek);

		const result = await this.dispatchCommand(cmd, [`${jobId}`]);

		if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
			return null;
		}

		return {
			id: parseNumericHeader(result.headers[0]),
			payload: result.data,
		};
	}

	/**
	 * Inspect the next ready job. Operates only on the currently used tube.
	 *
	 * @category Other Commands
	 */
	public async peekReady(): Promise<null | IClientRawReservedJob> {
		const cmd = getCommandInstance(BeanstalkCommand['peek-ready']);

		const result = await this.dispatchCommand(cmd);

		if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
			return null;
		}

		return {
			id: parseNumericHeader(result.headers[0]),
			payload: result.data,
		};
	}

	/**
	 * Inspect the next delayed job. Operates only on the currently used tube.
	 *
	 * @category Other Commands
	 */
	public async peekDelayed(): Promise<null | IClientRawReservedJob> {
		const cmd = getCommandInstance(BeanstalkCommand['peek-delayed']);

		const result = await this.dispatchCommand(cmd);

		if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
			return null;
		}

		return {
			id: parseNumericHeader(result.headers[0]),
			payload: result.data,
		};
	}

	/**
	 * Inspect the next buried job. Operates only on the currently used tube.
	 *
	 * @category Other Commands
	 */
	public async peekBuried(): Promise<null | IClientRawReservedJob> {
		const cmd = getCommandInstance(BeanstalkCommand['peek-buried']);

		const result = await this.dispatchCommand(cmd);

		if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
			return null;
		}

		return {
			id: parseNumericHeader(result.headers[0]),
			payload: result.data,
		};
	}

	/**
	 * The kick command applies only to the currently used tube. It moves jobs into
	 * the ready queue. If there are any buried jobs, it will only kick buried jobs.
	 * Otherwise it will kick delayed jobs.
	 *
	 * @param bound - integer upper bound on the number of jobs to kick. The server
	 * will kick no more than <bound> jobs.
	 *
	 * @category Other Commands
	 */
	public async kick(bound: number): Promise<number> {
		validateBound(bound);

		const cmd = getCommandInstance(BeanstalkCommand.kick);

		const result = await this.dispatchCommand(cmd, [`${bound}`]);

		return parseNumericHeader(result.headers[0]);
	}

	/**
	 * The kick-job command is a variant of kick that operates with a single job
	 * identified by its job id. If the given job id exists and is in a buried or
	 * delayed state, it will be moved to the ready queue of the the same tube where it
	 * currently belongs.
	 *
	 * @param jobId - integer id of the job.
	 * @category Other Commands
	 */
	public async kickJob(jobId: number): Promise<boolean> {
		validateJobId(jobId);

		const cmd = getCommandInstance(BeanstalkCommand['kick-job']);

		const result = await this.dispatchCommand(cmd, [`${jobId}`]);

		return result.status === BeanstalkResponseStatus.KICKED;
	}

	/**
	 * The stats command gives statistical information about the system as a whole.
	 *
	 * @category Other Commands
	 */
	public async stats(): Promise<IBeanstalkStats> {
		const cmd = getCommandInstance(BeanstalkCommand.stats);

		const result = await this.dispatchCommand(cmd);

		// constraint: the instance id is the one unquoted string in the response, so an all-digit id parses as a number
		return {...result.data, id: String(result.data.id)};
	}

	/**
	 * The stats-tube command gives statistical information about the specified tube
	 * if it exists.
	 *
	 * @category Other Commands
	 */
	public async statsTube(tubeName: string): Promise<IBeanstalkTubeStats | null> {
		validateTubeName(tubeName);

		const cmd = getCommandInstance(BeanstalkCommand['stats-tube']);

		const result = await this.dispatchCommand(cmd, [tubeName]);

		if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
			return null;
		}

		return result.data;
	}

	/**
	 * The stats-job command gives statistical information about the specified job if
	 * it exists.
	 *
	 * @param jobId - integer id of the job.
	 * @category Other Commands
	 */
	public async statsJob(jobId: number): Promise<IBeanstalkJobStats | null> {
		validateJobId(jobId);

		const cmd = getCommandInstance(BeanstalkCommand['stats-job']);

		const result = await this.dispatchCommand(cmd, [`${jobId}`]);

		if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
			return null;
		}

		return result.data;
	}

	/**
	 * The list-tubes command returns a list of all existing tubes.
	 *
	 * @category Other Commands
	 */
	public async listTubes(): Promise<string[]> {
		const cmd = getCommandInstance(BeanstalkCommand['list-tubes']);

		const result = await this.dispatchCommand(cmd);

		return result.data;
	}

	/**
	 * The list-tube-used command returns the tube currently being used by the
	 * client.
	 *
	 * @category Other Commands
	 */
	public async listTubeUsed(): Promise<string> {
		const cmd = getCommandInstance(BeanstalkCommand['list-tube-used']);

		const result = await this.dispatchCommand(cmd);

		return result.headers[0];
	}

	/**
	 * The list-tubes-watched command returns a list tubes currently being watched by
	 * the client.
	 *
	 * @category Other Commands
	 */
	public async listTubesWatched(): Promise<string[]> {
		const cmd = getCommandInstance(BeanstalkCommand['list-tubes-watched']);

		const result = await this.dispatchCommand(cmd);

		return result.data;
	}

	/**
	 * The pause-tube command can delay any new job being reserved for a given time.
	 *
	 * @param tubeName - tube to pause
	 * @param delay - integer number of seconds < 2**32 to wait before reserving any more
	 * jobs from the queue
	 *
	 * @category Other Commands
	 */
	public async pauseTube(tubeName: string, delay: number): Promise<boolean> {
		validateTubeName(tubeName);
		validateDelay(delay);

		const cmd = getCommandInstance(BeanstalkCommand['pause-tube']);

		const result = await this.dispatchCommand(cmd, [tubeName, `${delay}`]);

		return result.status === BeanstalkResponseStatus.PAUSED;
	}

	/**
	 * @category Client
	 */
	private waitQueue(): [waitPromise: Promise<void>, moveQueue: () => void] {
		let listNode: ILinkedListNode<{
			resolve: () => void;
			reject: (err?: Error) => void;
		}>;

		const promise = new Promise<void>((resolve, reject) => {
			listNode = this.#queue.push({resolve, reject});

			if (this.#queue.head === listNode) {
				resolve();
			}
		});

		return [
			promise,
			() => {
				// remove current node from list
				this.#queue.removeNode(listNode);

				// resolve first promise waiting in queue if it exists
				this.#queue.head?.value.resolve();
			},
		];
	}

	/**
	 * Transforms payload to buffer. Also performs size and type checks.
	 *
	 * In case provided payload is not a [[string | number]] it
	 * will be serialized via [[IClientCtorOptions.serializer]]
	 *
	 * @throws {ClientError}
	 * @category Client
	 */
	private payloadToBuffer(payload: any): Buffer | undefined {
		if (payload === undefined) return undefined;

		const {serializer, maxPayloadSize} = this.#opt;

		if (typeof payload !== 'string' && !serializer) {
			throw new ClientError(
				ClientErrorCode.ErrInvalidPayload,
				`Serializer not defined, payload has to be string, got ${typeof payload}. Configure serializer or serialize payload manually.`,
			);
		}

		let payloadBuffer: Buffer;

		if (serializer) {
			payloadBuffer = serializer.serialize(payload);
		} else {
			payloadBuffer = Buffer.from(payload);
		}

		if (payloadBuffer.length > maxPayloadSize) {
			throw new ClientError(
				ClientErrorCode.ErrPayloadTooBig,
				`${serializer ? 'Serialized payload' : 'Payload'} is too big,` +
					` maximum size is ${maxPayloadSize} bytes, got ${payloadBuffer.length}`,
			);
		}

		return payloadBuffer;
	}

	/**
	 * Force-disconnects after response framing is lost, so no later command reads a stale body as its own headers.
	 */
	private async abandonConnection(): Promise<void> {
		try {
			await this.disconnect(true);
		} catch {
			// the connection is already closing or closed; the rejection that triggered the teardown carries the cause
		}
	}

	/**
	 * Reads the response of the command that is currently on the wire. A connection that dies rejects the read with
	 * `ErrConnectionClosed`, and an abort of {signal} rejects it with the abort reason, so a command whose response
	 * the server will never send does not hold the queue.
	 */
	private async readCommandResponse(signal: AbortSignal): Promise<ICommandResponse> {
		const conn = this.#conn;
		return new Promise((resolve, reject) => {
			let response: Buffer = Buffer.alloc(0);
			let headers: ICommandResponseHeaders | null = null;
			let dataReadTimeout: NodeJS.Timeout;
			let cleanup: () => void;

			const dataListener = (data: Buffer) => {
				response = Buffer.concat([response, data]);

				if (!headers) {
					// check if headers already received
					try {
						headers = parseResponseHeaders(response);
					} catch (error) {
						cleanup();
						reject(error instanceof Error ? error : new Error(String(error)));
						void this.abandonConnection();
						return;
					}

					if (headers) {
						response = response.subarray(headers.headersLineLen);

						if (headers.hasData && response.length < headers.dataLength) {
							// if response data not read - start read timeout
							dataReadTimeout = setTimeout(() => {
								cleanup();
								reject(
									new ClientError(
										ClientErrorCode.ErrResponseRead,
										`Failed to read response data after ${this.#opt.dataReadTimeoutMs} ms`,
									),
								);
							}, this.#opt.dataReadTimeoutMs);
						}
					}
				}

				if (headers) {
					if (headers.hasData) {
						if (response.length >= headers.dataLength) {
							// response data is read, we're done
							cleanup();
							resolve({
								status: headers.status,
								headers: headers.headers,
								data: response.subarray(0, headers.dataLength),
							});
						}
					} else {
						cleanup();
						resolve({
							status: headers.status,
							headers: headers.headers,
						});
					}
				}
			};

			const abandonRead = () => {
				const {reason} = signal;

				cleanup();
				reject(reason instanceof Error ? reason : new Error(String(reason)));
			};

			const connectionLost = (cause?: Error) => {
				cleanup();
				reject(
					new ClientError(ClientErrorCode.ErrConnectionClosed, 'Connection closed while the response was awaited', {
						cause,
					}),
				);
			};

			cleanup = () => {
				clearTimeout(dataReadTimeout);
				conn.off('data', dataListener);
				conn.off('close', connectionLost);
				conn.off('error', connectionLost);
				signal.removeEventListener('abort', abandonRead);
			};

			conn.on('data', dataListener);
			conn.on('close', connectionLost);
			conn.on('error', connectionLost);
			signal.addEventListener('abort', abandonRead, {once: true});
		});
	}

	/**
	 * Sends command to the server and reads response which then passed to [[Command.handleResponse]].
	 *
	 * @category Client
	 */
	private async dispatchCommand<R extends BeanstalkResponseStatus = BeanstalkResponseStatus>(
		cmd: Command<R>,
		args?: string[],
		payload?: any,
	): Promise<ICommandHandledResponse<R>> {
		// wait for the queue
		const [waitPromise, moveQueue] = this.waitQueue();

		await waitPromise;
		let response: ICommandResponse;
		try {
			const conn = this.#conn;

			if (conn.getState() !== 'open') {
				throw new ClientError(
					ClientErrorCode.ErrConnectionNotOpened,
					`Unable to dispatch command on not opened connection, connection state is '${conn.getState()}'`,
				);
			}

			const command = cmd.buildCommandBuffer(args, this.payloadToBuffer(payload));
			const unsent = new AbortController();

			const [received] = await Promise.all([
				this.readCommandResponse(unsent.signal),
				conn.write(command).catch((error: unknown) => {
					unsent.abort(error);

					throw error;
				}),
			]);

			response = received;
		} finally {
			// move queue forward
			moveQueue();
		}

		return cmd.handleResponse(response, this.#opt.serializer);
	}
}
