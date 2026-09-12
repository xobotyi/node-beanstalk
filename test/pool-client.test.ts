import {describe, expect, it, vi} from 'vite-plus/test';
import {once} from 'node:events';
import {PoolClient} from '../src/pool-client.js';
import {Connection, type ConnectionState} from '../src/connection.js';

class OpenConnection extends Connection {
	public getState = vi.fn<() => ConnectionState>(() => 'open');

	public close = vi.fn<() => Promise<void>>(async () => {});
}

describe('PoolClient', () => {
	describe('releaseClient', () => {
		it('should emit `release` event on client', async () => {
			const c = new PoolClient();
			const released = once(c, 'release');

			c.releaseClient();

			await expect(released).resolves.toStrictEqual([c]);
		});
	});

	describe('Symbol.asyncDispose', () => {
		it('releases a connected client on scope exit instead of disconnecting it', async () => {
			const conn = new OpenConnection();
			const c = new PoolClient(undefined, conn);
			const disconnect = vi.spyOn(c, 'disconnect');
			const released = once(c, 'release');

			{
				await using scoped = c;
				expect(scoped.isConnected).toBe(true);
			}

			await expect(released).resolves.toStrictEqual([c]);
			expect(disconnect).not.toHaveBeenCalled();
			expect(conn.close).not.toHaveBeenCalled();
			expect(c.isConnected).toBe(true);
		});
	});
});
