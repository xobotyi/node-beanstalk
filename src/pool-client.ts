import {Client} from './client.js';

export class PoolClient extends Client {
	#release: ((client: PoolClient) => void) | undefined;

	/**
	 * Registers {handler} to run on the next release of this client and on no later one, so a client released twice
	 * reaches the pool once. Registering again replaces a handler that has not run yet.
	 */
	public onRelease(handler: (client: PoolClient) => void): void {
		this.#release = handler;
	}

	/**
	 * Release client back to the pool where it can be reserved again.
	 */
	public releaseClient(): void {
		const release = this.#release;

		this.#release = undefined;

		release?.(this);
	}

	/**
	 * Releases the client back to the pool, so `await using` returns it on scope exit instead of disconnecting.
	 */
	override async [Symbol.asyncDispose](): Promise<void> {
		this.releaseClient();

		return Promise.resolve();
	}
}
