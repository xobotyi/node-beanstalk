import {type PoolOptions} from './types.js';
import {DEFAULT_POOL_OPTIONS} from './const.js';
import {PoolClient} from './pool-client.js';
import {PoolError} from './error/pool-error.js';

export type PoolState = 'live' | 'disconnected' | 'disconnecting';

type PendingRequest = {
	resolve: (client: PoolClient) => void;
	reject: (err: Error) => void;
};

function takeFirst<V>(set: Set<V>): V | undefined {
	const {value} = set.values().next();

	if (value !== undefined) set.delete(value);

	return value;
}

const NO_PENDING_DEADLINE = 0;

export class Pool {
	readonly #opt: Required<PoolOptions>;

	readonly #clients: PoolClient[] = [];

	readonly #idleClients = new Set<PoolClient>();

	readonly #pendingQueue = new Set<PendingRequest>();

	#state: PoolState = 'live';

	/**
	 * A graceful `disconnect()` waits for the queue while the pool is still `live`, and no client is handed out in
	 * that window: the pool would close it while the caller holds it.
	 */
	#disconnectRequested = false;

	constructor(options: PoolOptions = {}) {
		this.#opt = {
			...DEFAULT_POOL_OPTIONS,
			...options,
		};
	}

	/**
	 * Total capacity of the pool.
	 */
	get capacity(): number {
		return this.#opt.capacity;
	}

	/**
	 * Amount of clients which are not reserved and currently idle in the pool.
	 */
	get idleCount(): number {
		return this.#idleClients.size;
	}

	/**
	 * Total amount of queued client requests when all clients are reserved. It is helpful to monitor
	 * this number to see if you need to adjust the size of the pool.
	 */
	get waitingCount(): number {
		return this.#pendingQueue.size;
	}

	/**
	 * Current pool state.
	 */
	getState(): PoolState {
		return this.#state;
	}

	/**
	 * Reserve a client from the pool.
	 *
	 * If the pool is full and all clients are currently reserved, this will wait in a FIFO queue
	 * until a client becomes available by it being released back to the pool.
	 *
	 * If there are idle clients in the pool it will be returned.
	 *
	 * If the pool is not full a new client will be created and connected.
	 */
	public async connect(): Promise<PoolClient> {
		if (this.#state !== 'live') {
			throw new PoolError(`Unable to gain client, pool is not live: ${this.#state}`);
		}

		if (this.#disconnectRequested) {
			throw new PoolError('Unable to gain client, pool is disconnecting.');
		}

		let client: PoolClient;

		if (this.#clients.length < this.#opt.capacity) {
			client = await this.createClient();
		} else {
			client = takeFirst(this.#idleClients) ?? (await this.createPendingPromise(this.#opt.pendingTimeoutMs));
		}

		client.once('release', this.handleClientRelease);

		return client;
	}

	/**
	 * Disconnect all clients from server after all pending requests performed.
	 * All currently reserved clients will not be returned to the pool and ended in-place after all
	 * pending requests performed.
	 *
	 * If {force} set to truthy value - clients pending requests will not be awaited.
	 */
	public async disconnect(force = false): Promise<void> {
		if (this.#state !== 'live') {
			throw new PoolError(`Unable to disconnect pool that is not live, current state: ${this.#state}`);
		}

		if (this.#disconnectRequested) {
			throw new PoolError('Unable to disconnect pool that is already disconnecting');
		}

		this.#disconnectRequested = true;

		if (this.#pendingQueue.size > 0 && !force) {
			// A disconnect that waits for its turn in the queue is not a caller the pool may give up on.
			await this.createPendingPromise(NO_PENDING_DEADLINE);
		}

		this.#state = 'disconnecting';

		const pending = [...this.#pendingQueue];
		this.#pendingQueue.clear();

		for (const {reject} of pending) {
			reject(new PoolError('Unable to gain client, pool is disconnecting.'));
		}

		this.#idleClients.clear();

		await Promise.allSettled(this.#clients.splice(0).map(async (client) => client.disconnect(force)));

		this.#state = 'disconnected';
	}

	/**
	 * Restore pool from disconnected state.
	 */
	public restore(): void {
		if (this.#state !== 'disconnected') {
			throw new PoolError(`Unable to restore pool that was not disconnected, current state: ${this.#state}`);
		}

		this.#disconnectRequested = false;
		this.#state = 'live';
	}

	/**
	 * Queues a caller until a client of the pool becomes free. A {timeoutMs} above zero rejects the caller once it
	 * passes, and `NO_PENDING_DEADLINE` leaves it queued for as long as the pool needs to serve it.
	 */
	private async createPendingPromise(timeoutMs: number): Promise<PoolClient> {
		return new Promise((resolve, reject) => {
			let deadline: NodeJS.Timeout | undefined;

			const pending: PendingRequest = {
				resolve: (client) => {
					clearTimeout(deadline);
					resolve(client);
				},
				reject: (error) => {
					clearTimeout(deadline);
					reject(error);
				},
			};
			this.#pendingQueue.add(pending);

			if (timeoutMs > 0) {
				deadline = setTimeout(() => {
					this.#pendingQueue.delete(pending);
					reject(new PoolError(`No client of the pool became available within ${timeoutMs} ms`));
				}, timeoutMs);
			}
		});
	}

	/**
	 * Takes a free slot of the pool with a connected client. A client that fails to connect gives its slot back, so a
	 * server that is down does not shrink the pool.
	 */
	private async createClient(): Promise<PoolClient> {
		const client = new PoolClient(this.#opt.clientOptions);
		this.#clients.push(client);

		// A pooled client answers its own `error` event, which an EventEmitter with no listener would throw instead.
		client.on('close', () => {
			this.evictClient(client);
		});
		client.on('error', () => {
			this.evictClient(client);
		});

		try {
			await client.connect();
		} catch (error) {
			this.evictClient(client);

			throw error;
		}

		return client;
	}

	/**
	 * Drops a client the pool can no longer hand out and passes its slot to the first waiter. The jobs that client
	 * had reserved are already lost: the server released them when the connection went down.
	 */
	private evictClient(client: PoolClient): void {
		const slot = this.#clients.indexOf(client);

		if (slot === -1) return;

		this.#clients.splice(slot, 1);
		this.#idleClients.delete(client);
		void this.serveNextWaiter();
	}

	/**
	 * Fills a slot that just became free with a new client for the first waiter in the queue.
	 */
	private async serveNextWaiter(): Promise<void> {
		if (this.#state !== 'live' || this.#clients.length >= this.#opt.capacity) return;

		const pending = takeFirst(this.#pendingQueue);

		if (!pending) return;

		try {
			pending.resolve(await this.createClient());
		} catch (error) {
			pending.reject(error instanceof Error ? error : new PoolError(String(error)));
		}
	}

	private readonly handleClientRelease = (client: PoolClient): void => {
		if (this.#state !== 'live') return;

		// An evicted client is not the pool's to hand out again, whoever still holds it.
		if (!this.#clients.includes(client)) return;

		const pending = takeFirst(this.#pendingQueue);

		if (pending) {
			pending.resolve(client);
		} else {
			this.#idleClients.add(client);
		}
	};
}
