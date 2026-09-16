import {Client} from './client.js';

export type PoolClientEvents = {
	release: [client: PoolClient];
};

export class PoolClient extends Client<PoolClientEvents> {
	/**
	 * Release client back to the pool where it can be reserved again.
	 */
	public releaseClient(): void {
		this.emit('release', this);
	}

	/**
	 * Releases the client back to the pool, so `await using` returns it on scope exit instead of disconnecting.
	 */
	override async [Symbol.asyncDispose](): Promise<void> {
		this.releaseClient();

		return Promise.resolve();
	}
}
