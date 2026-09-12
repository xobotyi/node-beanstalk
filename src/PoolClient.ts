import {Client} from './Client.js';

export type IPoolClientEvents = {
	release: [client: PoolClient];
};

export class PoolClient extends Client<IPoolClientEvents> {
	/**
	 * Release client back to the pool where it can be reserved again.
	 */
	public releaseClient(): void {
		this.emit('release', this);
	}
}
