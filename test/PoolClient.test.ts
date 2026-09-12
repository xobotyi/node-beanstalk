import {describe, expect, it, vi} from 'vite-plus/test';
import {PoolClient} from '../src/PoolClient.js';
import {Connection, type ConnectionState} from '../src/Connection.js';

class OpenConnection extends Connection {
	public getState = vi.fn<() => ConnectionState>(() => 'open');

	public close = vi.fn<() => Promise<void>>(async () => {});
}

describe('PoolClient', () => {
	describe('releaseClient', () => {
		it('should emit `release` event on client', async () => {
			const c = new PoolClient();
			const released = new Promise((resolve) => c.once('release', resolve));

			c.releaseClient();

			await expect(released).resolves.toBe(c);
		});
	});

	describe('Symbol.asyncDispose', () => {
		it('releases a connected client on scope exit instead of disconnecting it', async () => {
			const conn = new OpenConnection();
			const c = new PoolClient(undefined, conn);
			const disconnect = vi.spyOn(c, 'disconnect');
			const released = new Promise((resolve) => c.once('release', resolve));

			{
				await using scoped = c;
				expect(scoped.isConnected).toBe(true);
			}

			await expect(released).resolves.toBe(c);
			expect(disconnect).not.toHaveBeenCalled();
			expect(conn.close).not.toHaveBeenCalled();
			expect(c.isConnected).toBe(true);
		});
	});
});
