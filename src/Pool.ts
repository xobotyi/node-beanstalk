import { IClientCtorOptions, IPoolCtorOptions } from './types';
import { DEFAULT_POOL_OPTIONS } from './const';
// eslint-disable-next-line import/no-cycle
import { PoolClient } from './PoolClient';
import { LinkedList } from './util/LinkedList';
import { PoolError } from './error/PoolError';

export class Pool {
  private readonly _opt: Required<IPoolCtorOptions>;

  private readonly _clientOpt: Required<IClientCtorOptions>;

  private readonly _clients: PoolClient[] = [];

  private readonly _idleClients: PoolClient[] = [];

  private readonly _pendingQueue: LinkedList<(client: PoolClient) => void> = new LinkedList();

  private _ending = false;

  private _ended = false;

  constructor(options: IPoolCtorOptions = {}) {
    this._opt = {
      ...DEFAULT_POOL_OPTIONS,
      ...options,
    };

    const { capacity, ...clientOptions } = this._opt;
    this._clientOpt = clientOptions;
  }

  /**
   * @inheritDoc Client.debug
   */
  private debug(argsGetter: () => Parameters<typeof console.debug>): void {
    if (this._opt.debug) console.debug(argsGetter());
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
    return this._idleClients.length;
  }

  /**
   * Total amount of queued client requests when all clients are reserved. It is helpful to monitor
   * this number to see if you need to adjust the size of the pool.
   */
  get waitingCount(): number {
    return this._pendingQueue.size;
  }

  private createPendingPromise(): Promise<PoolClient> {
    return new Promise((resolve) => {
      this._pendingQueue.push(resolve);
    });
  }

  private handleClientRelease(client: PoolClient): void {
    if (this._ending) return;

    if (this._pendingQueue.head === null) {
      this._idleClients.push(client);
    } else {
      this._pendingQueue.shrinkHead(1)[0](client);
    }
  }

  /**
   * Reserve a client from the pool.
   *
   * If the pool is full and all clients are currently reserved,
   * this will wait in a FIFO queue until a client becomes available by it being released back to
   * the pool.
   *
   * If there are idle clients in the pool it will be returned.
   *
   * If the pool is not full a new client will be created & returned.
   */
  public async connect(): Promise<PoolClient> {
    if (this._ending) throw new PoolError(`Cannot use the pool after calling 'end' on it`);

    if (this._clients.length < this._opt.capacity) {
      const client = new PoolClient(this._clientOpt);
      this._clients.push(client);

      await client.connect();

      return client.once('release', this.handleClientRelease.bind(this, client));
    }

    const client = this._idleClients.shift() ?? (await this.createPendingPromise());

    client.once('release', this.handleClientRelease.bind(this, client));

    return client;
  }

  /**
   * Disconnect all clients from server after all pending requests performed.
   * All currently reserved clients will not be returned to the pool and ended in-place after all
   * pending requests performed.
   *
   * If {force} set to truthy value - clients pending requests will not be awaited.
   */
  public async end(force = false): Promise<void> {
    if (this._ending) return;

    this._ending = true;

    if (this._idleClients.length) {
      await Promise.allSettled(
        this._idleClients
          .splice(0, this._idleClients.length)
          .map((client) => this.removeClient(client, force))
      );
    }

    if (this._clients.length) {
      await Promise.allSettled(
        this._clients
          .splice(0, this._clients.length)
          .map((client) => this.removeClient(client, force))
      );
    }

    this._ended = true;
    this._ending = false;
  }

  private async removeClient(client: PoolClient, force = false): Promise<void> {
    this._idleClients.filter((c) => c !== client);
    this._clients.filter((c) => c !== client);

    await client.disconnect(force);
  }
}
