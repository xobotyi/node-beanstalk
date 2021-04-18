import { Client } from './Client';

export interface PoolClient {
  emit: ((event: string, listener: (...args: any[]) => void) => boolean) &
    ((event: 'release', client: PoolClient) => boolean);

  on: ((event: string, listener: (...args: any[]) => void) => this) &
    ((event: 'release', listener: (client: PoolClient) => void) => this);

  once: ((event: string, listener: (...args: any[]) => void) => this) &
    ((event: 'release', listener: (client: PoolClient) => void) => this);

  prependListener: ((event: string, listener: (...args: any[]) => void) => this) &
    ((event: 'release', listener: (client: PoolClient) => void) => this);

  prependOnceListener: ((event: string, listener: (...args: any[]) => void) => this) &
    ((event: 'release', listener: (client: PoolClient) => void) => this);
}

export class PoolClient extends Client {
  /**
   * Release client back to the pool where it can be reserved again.
   */
  public async releaseClient(): Promise<void> {
    this.emit('release', this);
  }
}
