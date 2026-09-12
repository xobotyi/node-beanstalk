import {type IPoolCtorOptions} from './types.js';
import {DEFAULT_POOL_OPTIONS} from './const.js';
import {PoolClient} from './PoolClient.js';
import {LinkedList} from './util/LinkedList.js';
import {PoolError} from './error/PoolError.js';

export type PoolState = 'live' | 'disconnected' | 'disconnecting';

export class Pool {
	readonly #opt: Required<IPoolCtorOptions>;

	readonly #clients: PoolClient[] = [];

	readonly #idleClients = new LinkedList<PoolClient>();

	readonly #pendingQueue = new LinkedList<{
		resolve: (client: PoolClient) => void;
		reject: (err: PoolError) => void;
	}>();

	#state: PoolState = 'live';

	constructor(options: IPoolCtorOptions = {}) {
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

		let client: PoolClient;

		if (this.#clients.length < this.#opt.capacity) {
			client = new PoolClient(this.#opt.clientOptions);
			this.#clients.push(client);

			await client.connect();
		} else {
			client = this.#idleClients.unshift() ?? (await this.createPendingPromise());
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

		if (this.#pendingQueue.size > 0 && !force) {
			await this.createPendingPromise();
		}

		this.#state = 'disconnecting';

		// reject all pending queue
		for (const {reject} of this.#pendingQueue.truncate()) {
			reject(new PoolError('Unable to gain client, pool is disconnecting.'));
		}

		this.#idleClients.truncate();

		// disconnect all existing clients
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

		this.#state = 'live';
	}

	private async createPendingPromise(): Promise<PoolClient> {
		return new Promise((resolve, reject) => {
			this.#pendingQueue.push({resolve, reject});
		});
	}

	private readonly handleClientRelease = (client: PoolClient): void => {
		if (this.#state !== 'live') return;

		const pending = this.#pendingQueue.unshift();

		if (pending) {
			pending.resolve(client);
		} else {
			this.#idleClients.push(client);
		}
	};
}
