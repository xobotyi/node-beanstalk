import { IPoolCtorOptions } from './types';
import { DEFAULT_POOL_OPTIONS } from './const';
import { PoolClient } from './PoolClient';
import { LinkedList } from './util/LinkedList';
import { PoolError } from './error/PoolError';

export type PoolState = 'live' | 'disconnected' | 'disconnecting';

interface IPendingEntry {
  resolve: (client: PoolClient) => void;
  reject: (err: PoolError) => void;
  /** Wait budget, set when `pendingTimeoutMs > 0`. */
  timer?: NodeJS.Timeout;
}

export class Pool {
  private readonly _opt: Required<IPoolCtorOptions>;

  private readonly _clients: PoolClient[] = [];

  private readonly _idleClients: LinkedList<PoolClient> = new LinkedList();

  private readonly _pendingQueue: LinkedList<IPendingEntry> = new LinkedList();

  private _state: PoolState = 'live';

  /** Set by a graceful `disconnect()` while it waits its turn in the queue. No client is created. */
  private _draining = false;

  constructor(options: IPoolCtorOptions = {}) {
    this._opt = {
      ...DEFAULT_POOL_OPTIONS,
      ...options,
    };
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

  /**
   * Current pool state.
   */
  getState(): PoolState {
    return this._state;
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
    if (this._state !== 'live') {
      throw new PoolError(`Unable to gain client, pool is not live: ${this._state}`);
    }

    if (this._draining) {
      throw new PoolError('Unable to gain client, pool is disconnecting.');
    }

    let client: PoolClient;

    if (this._clients.length < this._opt.capacity) {
      client = await this.createClient();
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

    this._draining = true;

    if (this._pendingQueue.size && !force) {
      // Wait our turn in the queue. The wait is rejected when every client died and
      // no release can serve the queue any more; the drain then goes on.
      // The drain has no wait budget.
      await this.createPendingPromise(0).catch(() => undefined);
    }

    this._state = 'disconnecting';

    this.rejectAllPending(new PoolError('Unable to gain client, pool is disconnecting.'));

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

    this._draining = false;
    this._state = 'live';
  }

  private async createClient(): Promise<PoolClient> {
    const client = new PoolClient(this._opt.clientOptions);
    this._clients.push(client);

    // Death is reported by the rejected command and by `close`. An `error` without a
    // listener would end the process. A write onto a reset socket emits `error` before
    // `close`, and the holder's release runs in between, so the client dies on both.
    const evict = () => this.evict(client);
    client.on('error', evict);
    client.on('close', evict);

    try {
      await client.connect();
    } catch (err) {
      this.evict(client);
      throw err;
    }

    return client;
  }

  private evict(client: PoolClient): void {
    const index = this._clients.indexOf(client);
    if (index === -1) return;

    this._clients.splice(index, 1);
    this._idleClients.remove(client);

    this.serveNextPending();
  }

  private serveNextPending(): void {
    if (this._state !== 'live' || this._clients.length >= this._opt.capacity) return;

    if (this._draining) {
      // A drain creates no client. With no client left, no release can ever serve the queue.
      if (this._clients.length === 0) {
        this.rejectAllPending(new PoolError('Unable to gain client, pool is disconnecting.'));
      }
      return;
    }

    const pending = this.takePending();
    if (!pending) return;

    this.createClient().then(pending.resolve, pending.reject);
  }

  /** A queued waiter holds no socket, so the timer is the only bound on its wait. */
  private createPendingPromise(timeoutMs = this._opt.pendingTimeoutMs): Promise<PoolClient> {
    return new Promise((resolve, reject) => {
      const entry: IPendingEntry = { resolve, reject };
      const node = this._pendingQueue.push(entry);

      if (timeoutMs > 0) {
        entry.timer = setTimeout(() => {
          this._pendingQueue.removeNode(node);
          reject(new PoolError(`No client available within ${timeoutMs} ms`));
        }, timeoutMs);
        entry.timer.unref();
      }
    });
  }

  private handleClientRelease = (client: PoolClient): void => {
    // An evicted client can still be released by the holder that had it when it died.
    if (this._state !== 'live' || !this._clients.includes(client)) return;

    const pending = this.takePending();

    if (pending) {
      pending.resolve(client);
    } else {
      this._idleClients.push(client);
    }
  };

  private rejectAllPending(err: PoolError): void {
    this._pendingQueue.truncate().forEach(({ reject, timer }) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
  }

  private takePending(): IPendingEntry | undefined {
    const pending = this._pendingQueue.unshift();
    if (pending?.timer) clearTimeout(pending.timer);
    return pending;
  }
}
