import {describe, expect, it, vi} from 'vite-plus/test';
import {PoolClient} from '../src/pool-client.js';
import {Connection, type ConnectionState} from '../src/connection.js';

class OpenConnection extends Connection {
	public getState = vi.fn<() => ConnectionState>(() => 'open');

	public close = vi.fn<() => Promise<void>>(async () => {});
}

describe('PoolClient', () => {
	describe('releaseClient', () => {
		it('should call the registered handler with the client', () => {
			const c = new PoolClient();
			const release = vi.fn<(client: PoolClient) => void>();
			c.onRelease(release);

			c.releaseClient();

			expect(release).toHaveBeenCalledExactlyOnceWith(c);
		});

		it('should call the registered handler once, whatever the number of releases', () => {
			const c = new PoolClient();
			const release = vi.fn<(client: PoolClient) => void>();
			c.onRelease(release);

			c.releaseClient();
			c.releaseClient();

			expect(release).toHaveBeenCalledExactlyOnceWith(c);
		});

		it('should do nothing when no handler is registered', () => {
			const c = new PoolClient();

			expect(() => {
				c.releaseClient();
			}).not.toThrow();
		});
	});

	describe('Symbol.asyncDispose', () => {
		it('releases a connected client on scope exit instead of disconnecting it', async () => {
			const conn = new OpenConnection();
			const c = new PoolClient(undefined, conn);
			const disconnect = vi.spyOn(c, 'disconnect');
			const release = vi.fn<(client: PoolClient) => void>();
			c.onRelease(release);

			{
				await using scoped = c;
				expect(scoped.isConnected).toBe(true);
			}

			expect(release).toHaveBeenCalledExactlyOnceWith(c);
			expect(disconnect).not.toHaveBeenCalled();
			expect(conn.close).not.toHaveBeenCalled();
			expect(c.isConnected).toBe(true);
		});
	});
});
