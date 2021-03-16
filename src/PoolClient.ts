import { Client } from './Client';

export class PoolClient extends Client {
  /**
   * Release client back to the pool where it can be reserved again.
   */
  public async releaseClient(): Promise<void> {
    this.emit('release');
  }
}
