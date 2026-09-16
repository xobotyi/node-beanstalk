import {type AddressInfo, createServer, type Server, type Socket} from 'node:net';
import {once} from 'node:events';
import {afterEach, describe, expect, it} from 'vite-plus/test';
import {Client, Pool} from '../src/index.js';
import {ClientErrorCode} from '../src/error/client-error.js';

/**
 * These tests run a real `Client` over a real socket, which is what tells whether `Connection` and `Client` agree
 * about a connection that died. Every other suite here replaces one of the two with a mock.
 */
describe('a broker that goes away', () => {
	const servers: Server[] = [];

	type Broker = {
		port: number;
		/** The socket the broker accepted. The client of a test is the only one that dials it. */
		peer: Promise<Socket>;
	};

	/**
	 * A server that answers a `use` command and nothing else, the way a broker with no jobs leaves a `reserve`
	 * unanswered until one arrives.
	 */
	async function startBroker(): Promise<Broker> {
		const accepted = Promise.withResolvers<Socket>();
		const server = createServer((sock) => {
			sock.on('error', () => {});
			sock.on('data', (data: Buffer) => {
				if (data.toString().startsWith('use ')) {
					sock.write('USING default\r\n');
				}
			});

			accepted.resolve(sock);
		});

		servers.push(server);
		server.listen(0, '127.0.0.1');
		await once(server, 'listening');

		return {port: (server.address() as AddressInfo).port, peer: accepted.promise};
	}

	async function closedOnce(client: Client): Promise<void> {
		return new Promise((resolve) => {
			client.once('close', resolve);
		});
	}

	afterEach(() => {
		for (const server of servers.splice(0)) {
			server.close();
		}
	});

	it('should reject the command in flight and the commands queued behind it', async () => {
		const broker = await startBroker();
		const c = new Client({port: broker.port, host: '127.0.0.1'});
		c.on('error', () => {});
		const closed = closedOnce(c);

		await c.connect();
		const peer = await broker.peer;
		const reserving = c.reserveWithTimeout(30);
		const queued = c.statsTube('default');

		// The reserve is on the wire once the broker has read it, and the broker leaves it unanswered.
		await once(peer, 'data');
		peer.destroy();

		await expect(reserving).rejects.toHaveProperty('code', ClientErrorCode.ErrConnectionClosed);
		await expect(queued).rejects.toHaveProperty('code', ClientErrorCode.ErrConnectionNotOpened);
		await closed;
		expect(c.isConnected).toBe(false);
		expect(c.queueSize).toBe(0);
	});

	it('should connect again after the broker dropped the socket', async () => {
		const broker = await startBroker();
		const c = new Client({port: broker.port, host: '127.0.0.1'});
		c.on('error', () => {});

		await c.connect();
		await expect(c.use('my-own-tube')).resolves.toBe('default');
		const closed = closedOnce(c);
		const peer = await broker.peer;

		peer.destroy();
		await closed;

		await c.connect();

		await expect(c.use('my-own-tube')).resolves.toBe('default');
		await c.disconnect();
	});

	it('should give the pool a new client for the slot of the one that died', async () => {
		const broker = await startBroker();
		const p = new Pool({capacity: 1, clientOptions: {port: broker.port, host: '127.0.0.1'}});
		const c1 = await p.connect();
		await expect(c1.use('my-own-tube')).resolves.toBe('default');
		const closed = closedOnce(c1);
		const peer = await broker.peer;

		peer.destroy();
		await closed;

		const c2 = await p.connect();

		expect(c2).not.toBe(c1);
		await expect(c2.use('my-own-tube')).resolves.toBe('default');
		c2.releaseClient();
		await p.disconnect();
	});
});
