import EventEmitter from 'node:events';
import {
	CommandName,
	JobState,
	ResponseStatus,
	type JobStats,
	type Stats,
	type TubeStats,
	type ClientOptions,
	type Job,
	type Serializer,
	type CommandHandledResponse,
	type CommandResponse,
	type CommandResponseHeaders,
} from './types.js';
import {type Command} from './command.js';
import {ClientError, ClientErrorCode} from './error/client-error.js';
import {getCommandInstance} from './util/get-command-instance.js';
import {DEFAULT_CLIENT_OPTIONS} from './const.js';
import {parseNumericHeader, parseResponseHeaders, requireHeader} from './util/parse-response-headers.js';
import {requireMapBody, requireStringListBody} from './util/response-body.js';
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

const DISPLACED_BY_FORCED_DISCONNECT: string = ClientErrorCode.ErrDisconnecting;

const NO_RESPONSE_DEADLINE = 0;

type QueuedRequest = {
	resolve: () => void;
	reject: (err?: Error) => void;
};

export type ClientEvents = {
	connect: [];
	close: [];
	error: [err: Error];
};

export class Client extends EventEmitter<ClientEvents> {
	readonly #conn: Connection;

	readonly #opt: Omit<Required<ClientOptions>, 'serializer'> & {serializer: Serializer | undefined};

	readonly #queue = new Set<QueuedRequest>();

	#disconnecting: Promise<void> | undefined;

	constructor(options: ClientOptions = {}, connection = new Connection()) {
		super();

		this.#opt = {
			...DEFAULT_CLIENT_OPTIONS,
			...options,
		};

		this.#conn = connection;

		connection.on('close', () => {
			this.emit('close');
		});
		connection.on('error', (error) => {
			this.emit('error', error);
		});
	}

	/**
	 * The request whose turn it is.
	 */
	private get queueHead(): QueuedRequest | undefined {
		return this.#queue.values().next().value;
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

			await this.#conn.open(this.#opt.port, this.#opt.host, this.#opt.connectTimeoutMs);

			this.emit('connect');
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
			// constraint: the command of the head request is already on the wire, so even a forced disconnect awaits it
			const {queueHead} = this;

			for (const queued of this.#queue) {
				if (queued === queueHead) continue;

				this.#queue.delete(queued);
				queued.reject(new ClientError(ClientErrorCode.ErrDisconnecting, 'Client is disconnecting'));
			}
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

		const cmd = getCommandInstance(CommandName.use);

		const result = await this.dispatchCommand(cmd, [tubeName]);

		return requireHeader(result.headers, 0);
	}

	/**
	 * This command for any process that wants to insert a job into the queue.
	 *
	 * @param payload - Payload of the job. Non string or integer values will be serialized with
	 * {@link ClientOptions.serializer}. Byte size of payload should not exceed server's
	 * max-job-size (default: 2**16) nor client's {@link ClientOptions.maxPayloadSize}.
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
		payload: unknown,
		ttr: number = this.#opt.defaultTTR,
		priority: number = this.#opt.defaultPriority,
		delay: number = this.#opt.defaultDelay,
	): Promise<{
		id: number;
		state: typeof JobState.buried | typeof JobState.ready | typeof JobState.delayed;
	}> {
		validateTTR(ttr);
		validatePriority(priority);
		validateDelay(delay);

		if (payload === undefined) {
			throw new TypeError(`payload has to be a non-undefined value`);
		}

		const cmd = getCommandInstance(CommandName.put);

		const result = await this.dispatchCommand(cmd, [`${priority}`, `${delay}`, `${ttr}`], payload);

		if (result.status === ResponseStatus.JOB_TOO_BIG) {
			throw new BeanstalkError(result.status, `Provided job payload exceeds maximal server's 'max-job-size' config`);
		}

		if (result.status === ResponseStatus.EXPECTED_CRLF) {
			throw new BeanstalkError(result.status, `Missing trailing CRLF`);
		}

		if (result.status === ResponseStatus.DRAINING) {
			throw new BeanstalkError(result.status, `Server is in 'drain mode' and no longer accepting new jobs.`);
		}

		const state = delay === 0 ? JobState.ready : JobState.delayed;

		return {
			id: parseNumericHeader(result.headers[0]),
			state: result.status === ResponseStatus.BURIED ? JobState.buried : state,
		};
	}

	/**
	 * This will return a newly-reserved job. If no job is available to be reserved,
	 * beanstalkd will wait to send a response until one becomes available. Once a
	 * job is reserved for the client, the client has limited time to run (TTR) the
	 * job before the job times out. When the job times out, the server will put the
	 * job back into the ready queue. Both the TTR and the actual time left can be
	 * found in response to the {@link Client.statsJob} command.
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
	public async reserve(): Promise<null | Job> {
		const cmd = getCommandInstance(CommandName.reserve);

		// constraint: the server holds `reserve` until a job exists, so no deadline tells a silent server from an idle one
		const result = await this.dispatchCommand(cmd, undefined, undefined, NO_RESPONSE_DEADLINE);

		if (result.status === ResponseStatus.TIMED_OUT) {
			return null;
		}

		if (result.status === ResponseStatus.DEADLINE_SOON) {
			throw new BeanstalkError(
				result.status,
				'One of jobs reserved by this client will reach deadline soon, release it first.',
			);
		}

		return {
			id: parseNumericHeader(result.headers[0]),
			payload: result.data,
		};
	}

	/**
	 * Same as {@link Client.reserve} but with limited amount of time to wait for the job.
	 *
	 * A timeout value of 0 will cause the server to immediately return either a
	 * response or TIMED_OUT. A positive value of timeout will limit the amount of
	 * time the client will block on the reserve request until a job becomes
	 * available.
	 *
	 * @category Worker Commands
	 */
	public async reserveWithTimeout(timeout: number): Promise<null | Job> {
		validateTimeout(timeout);

		const cmd = getCommandInstance(CommandName['reserve-with-timeout']);

		const result = await this.dispatchCommand(cmd, [`${timeout}`], undefined, this.responseDeadlineMs(timeout * 1000));

		if (result.status === ResponseStatus.TIMED_OUT) {
			return null;
		}

		if (result.status === ResponseStatus.DEADLINE_SOON) {
			throw new BeanstalkError(
				result.status,
				'One of jobs reserved by this client will reach deadline soon, release it first.',
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
	public async reserveJob(jobId: number): Promise<null | Job> {
		validateJobId(jobId);

		const cmd = getCommandInstance(CommandName['reserve-job']);

		const result = await this.dispatchCommand(cmd, [`${jobId}`]);

		if (result.status === ResponseStatus.NOT_FOUND) {
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

		const cmd = getCommandInstance(CommandName.delete);

		const result = await this.dispatchCommand(cmd, [`${jobId}`]);

		return result.status === ResponseStatus.DELETED;
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
	): Promise<null | typeof JobState.buried | typeof JobState.ready | typeof JobState.delayed> {
		validateJobId(jobId);
		validatePriority(priority);
		validateDelay(delay);

		const cmd = getCommandInstance(CommandName.release);

		const result = await this.dispatchCommand(cmd, [`${jobId}`, `${priority}`, `${delay}`]);

		if (result.status === ResponseStatus.NOT_FOUND) {
			return null;
		}

		if (result.status === ResponseStatus.BURIED) {
			return JobState.buried;
		}

		return delay === 0 ? JobState.ready : JobState.delayed;
	}

	/**
	 * The bury command puts a job into the "buried" state. Buried jobs are put into a
	 * FIFO linked list and will not be touched by the server again until a client
	 * kicks them with the {@link Client.kick} command
	 *
	 * @param jobId - integer id of the job to bury.
	 * @param priority - a new priority to assign to the job.
	 *
	 * @category Worker Commands
	 */
	public async bury(jobId: number, priority: number = this.#opt.defaultPriority): Promise<boolean> {
		validateJobId(jobId);
		validatePriority(priority);

		const cmd = getCommandInstance(CommandName.bury);

		const result = await this.dispatchCommand(cmd, [`${jobId}`, `${priority}`]);

		return result.status === ResponseStatus.BURIED;
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

		const cmd = getCommandInstance(CommandName.touch);

		const result = await this.dispatchCommand(cmd, [`${jobId}`]);

		return result.status === ResponseStatus.TOUCHED;
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

		const cmd = getCommandInstance(CommandName.watch);

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

		const cmd = getCommandInstance(CommandName.ignore);

		const result = await this.dispatchCommand(cmd, [tubeName]);

		if (result.status === ResponseStatus.WATCHING) {
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
	public async peek(jobId: number): Promise<null | Job> {
		validateJobId(jobId);

		const cmd = getCommandInstance(CommandName.peek);

		const result = await this.dispatchCommand(cmd, [`${jobId}`]);

		if (result.status === ResponseStatus.NOT_FOUND) {
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
	public async peekReady(): Promise<null | Job> {
		const cmd = getCommandInstance(CommandName['peek-ready']);

		const result = await this.dispatchCommand(cmd);

		if (result.status === ResponseStatus.NOT_FOUND) {
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
	public async peekDelayed(): Promise<null | Job> {
		const cmd = getCommandInstance(CommandName['peek-delayed']);

		const result = await this.dispatchCommand(cmd);

		if (result.status === ResponseStatus.NOT_FOUND) {
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
	public async peekBuried(): Promise<null | Job> {
		const cmd = getCommandInstance(CommandName['peek-buried']);

		const result = await this.dispatchCommand(cmd);

		if (result.status === ResponseStatus.NOT_FOUND) {
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

		const cmd = getCommandInstance(CommandName.kick);

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

		const cmd = getCommandInstance(CommandName['kick-job']);

		const result = await this.dispatchCommand(cmd, [`${jobId}`]);

		return result.status === ResponseStatus.KICKED;
	}

	/**
	 * The stats command gives statistical information about the system as a whole.
	 *
	 * @category Other Commands
	 */
	public async stats(): Promise<Stats> {
		const cmd = getCommandInstance(CommandName.stats);

		const result = await this.dispatchCommand(cmd);

		// constraint: the instance id is the one unquoted string in the response, so an all-digit id parses as a number
		const {id, ...rest} = requireMapBody(result.data, CommandName.stats) as Omit<Stats, 'id'> & {id: unknown};

		return {...rest, id: String(id)};
	}

	/**
	 * The stats-tube command gives statistical information about the specified tube
	 * if it exists.
	 *
	 * @category Other Commands
	 */
	public async statsTube(tubeName: string): Promise<TubeStats | null> {
		validateTubeName(tubeName);

		const cmd = getCommandInstance(CommandName['stats-tube']);

		const result = await this.dispatchCommand(cmd, [tubeName]);

		if (result.status === ResponseStatus.NOT_FOUND) {
			return null;
		}

		return requireMapBody(result.data, CommandName['stats-tube']) as TubeStats;
	}

	/**
	 * The stats-job command gives statistical information about the specified job if
	 * it exists.
	 *
	 * @param jobId - integer id of the job.
	 * @category Other Commands
	 */
	public async statsJob(jobId: number): Promise<JobStats | null> {
		validateJobId(jobId);

		const cmd = getCommandInstance(CommandName['stats-job']);

		const result = await this.dispatchCommand(cmd, [`${jobId}`]);

		if (result.status === ResponseStatus.NOT_FOUND) {
			return null;
		}

		return requireMapBody(result.data, CommandName['stats-job']) as JobStats;
	}

	/**
	 * The list-tubes command returns a list of all existing tubes.
	 *
	 * @category Other Commands
	 */
	public async listTubes(): Promise<string[]> {
		const cmd = getCommandInstance(CommandName['list-tubes']);

		const result = await this.dispatchCommand(cmd);

		return requireStringListBody(result.data, CommandName['list-tubes']);
	}

	/**
	 * The list-tube-used command returns the tube currently being used by the
	 * client.
	 *
	 * @category Other Commands
	 */
	public async listTubeUsed(): Promise<string> {
		const cmd = getCommandInstance(CommandName['list-tube-used']);

		const result = await this.dispatchCommand(cmd);

		return requireHeader(result.headers, 0);
	}

	/**
	 * The list-tubes-watched command returns a list tubes currently being watched by
	 * the client.
	 *
	 * @category Other Commands
	 */
	public async listTubesWatched(): Promise<string[]> {
		const cmd = getCommandInstance(CommandName['list-tubes-watched']);

		const result = await this.dispatchCommand(cmd);

		return requireStringListBody(result.data, CommandName['list-tubes-watched']);
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

		const cmd = getCommandInstance(CommandName['pause-tube']);

		const result = await this.dispatchCommand(cmd, [tubeName, `${delay}`]);

		return result.status === ResponseStatus.PAUSED;
	}

	/**
	 * @category Client
	 */
	private waitQueue(): [waitPromise: Promise<void>, moveQueue: () => void] {
		let queued: QueuedRequest;

		const promise = new Promise<void>((resolve, reject) => {
			queued = {resolve, reject};
			this.#queue.add(queued);

			if (this.queueHead === queued) {
				resolve();
			}
		});

		return [
			promise,
			() => {
				this.#queue.delete(queued);
				this.queueHead?.resolve();
			},
		];
	}

	/**
	 * Transforms payload to buffer. Also performs size and type checks.
	 *
	 * In case provided payload is not a `string` or `number` it
	 * will be serialized via {@link ClientOptions.serializer}
	 *
	 * @throws {ClientError}
	 * @category Client
	 */
	private payloadToBuffer(payload: unknown): Buffer | undefined {
		if (payload === undefined) return undefined;

		const {serializer, maxPayloadSize} = this.#opt;

		let payloadBuffer: Buffer;

		if (serializer) {
			payloadBuffer = serializer.serialize(payload);
		} else if (typeof payload === 'string') {
			payloadBuffer = Buffer.from(payload);
		} else {
			throw new ClientError(
				ClientErrorCode.ErrInvalidPayload,
				`Serializer not defined, payload has to be string, got ${typeof payload}. Configure serializer or serialize payload manually.`,
			);
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
	 *
	 * A {deadlineMs} above zero bounds the wait for the whole response and drops the connection on expiry, since
	 * the protocol cannot cancel a command that is already on the wire. {@link ClientOptions.responseTimeoutMs}
	 * states what that costs.
	 */
	private async readCommandResponse(signal: AbortSignal, deadlineMs: number): Promise<CommandResponse> {
		const conn = this.#conn;
		return new Promise((resolve, reject) => {
			let response: Buffer = Buffer.alloc(0);
			let headers: CommandResponseHeaders | null = null;
			let dataReadTimeout: NodeJS.Timeout;
			let responseTimeout: NodeJS.Timeout | undefined;
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
								void this.abandonConnection();
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
				const reason: unknown = signal.reason;

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
				clearTimeout(responseTimeout);
				conn.off('data', dataListener);
				conn.off('close', connectionLost);
				conn.off('error', connectionLost);
				signal.removeEventListener('abort', abandonRead);
			};

			if (deadlineMs > 0) {
				responseTimeout = setTimeout(() => {
					cleanup();
					reject(
						new ClientError(
							ClientErrorCode.ErrResponseTimeout,
							`Server sent no response within ${deadlineMs} ms, dropping the connection and every job reserved on it`,
						),
					);
					void this.abandonConnection();
				}, deadlineMs);
			}

			conn.on('data', dataListener);
			conn.on('close', connectionLost);
			conn.on('error', connectionLost);
			signal.addEventListener('abort', abandonRead, {once: true});
		});
	}

	/**
	 * The deadline of a command the server may hold for {serverHoldsForMs} before it answers, which is what
	 * `reserve-with-timeout` does. Zero means no deadline, and that is the only correct value for a command the
	 * server holds for as long as it likes.
	 */
	private responseDeadlineMs(serverHoldsForMs = 0): number {
		const {responseTimeoutMs} = this.#opt;

		return responseTimeoutMs > 0 ? responseTimeoutMs + serverHoldsForMs : NO_RESPONSE_DEADLINE;
	}

	/**
	 * Sends command to the server and reads response which then passed to {@link Command.handleResponse}.
	 *
	 * @category Client
	 */
	private async dispatchCommand<R extends ResponseStatus = ResponseStatus>(
		cmd: Command<R>,
		args?: string[],
		payload?: unknown,
		deadlineMs: number = this.responseDeadlineMs(),
	): Promise<CommandHandledResponse<R>> {
		// wait for the queue
		const [waitPromise, moveQueue] = this.waitQueue();

		await waitPromise;
		let response: CommandResponse;
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
				this.readCommandResponse(unsent.signal, deadlineMs),
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
