import { IPoolCtorOptions } from './types';
import { DEFAULT_POOL_OPTIONS } from './const';
import { PoolClient } from './PoolClient';
import { LinkedList } from './util/LinkedList';
import { PoolError } from './error/PoolError';

export type PoolState = 'live' | 'disconnected' | 'disconnecting';

export class Pool {
  private readonly _opt: Required<IPoolCtorOptions>;

  private readonly _clients: PoolClient[] = [];

  private readonly _idleClients: LinkedList<PoolClient> = new LinkedList();

  private readonly _pendingQueue: LinkedList<{
    resolve: (client: PoolClient) => void;
    reject: (err: PoolError) => void;
  }> = new LinkedList();

  private _state: PoolState = 'live';

  constructor(options: IPoolCtorOptions = {}) {
    this._opt = {
      ...DEFAULT_POOL_OPTIONS,
      ...options,
    };
  }

  /**
   * Current pool state.
   */
  getState(): PoolState {
    return this._state;
  }

  /**
   * Total capacity of the pool.
   */
  get capacity(): number {
    return this._opt.capacity;
  }

  /**
   * Amount of clients which are not reserved and currently idle in the pool.
   */
  get idleCount(): number {
    return this._idleClients.size;
  }

  /**
   * Total amount of queued client requests when all clients are reserved. It is helpful to monitor
   * this number to see if you need to adjust the size of the pool.
   */
  get waitingCount(): number {
    return this._pendingQueue.size;
  }

  private createPendingPromise(): Promise<PoolClient> {
    return new Promise((resolve, reject) => {
      this._pendingQueue.push({ resolve, reject });
    });
  }

  private handleClientRelease = (client: PoolClient): void => {
    if (this._state !== 'live') return;

    const pending = this._pendingQueue.unshift();

    if (pending) {
      pending.resolve(client);
    } else {
      this._idleClients.push(client);
    }
  };

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
    if (this._state !== 'live') {
      throw new PoolError(`Unable to gain client, pool is not live: ${this._state}`);
    }

    let client: PoolClient;

    if (this._clients.length < this._opt.capacity) {
      client = new PoolClient(this._opt.clientOptions);
      this._clients.push(client);

      await client.connect();
    } else {
      client = this._idleClients.unshift() ?? (await this.createPendingPromise());
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
    if (this._state !== 'live') {
      throw new PoolError(
        `Unable to disconnect pool that is not live, current state: ${this._state}`
      );
    }

    if (this._pendingQueue.size) {
      if (!force) {
        // in case non-forced disconnect - we wait in queue
        await this.createPendingPromise();
      }
    }

    this._state = 'disconnecting';

    // reject all pending queue
    // eslint-disable-next-line no-restricted-syntax
    for (const { reject } of this._pendingQueue.truncate()) {
      reject(new PoolError('Unable to gain client, pool is disconnecting.'));
    }

    this._idleClients.truncate();

    // disconnect all existing clients
    await Promise.allSettled(
      this._clients.splice(0, this._clients.length).map((client) => client.disconnect(force))
    );

    this._state = 'disconnected';
  }

  /**
   * Restore pool from disconnected state.
   */
  public restore(): void {
    if (this._state !== 'disconnected') {
      throw new PoolError(
        `Unable to restore pool that was not disconnected, current state: ${this._state}`
      );
    }

    this._state = 'live';
  }
}
