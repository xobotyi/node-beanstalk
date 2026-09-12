import {afterAll, beforeAll, describe, expect, it} from 'vite-plus/test';
import {EventEmitter, once} from 'node:events';
import {type AddressInfo, createServer} from 'node:net';
import {Connection} from '../src/connection.js';
import {ConnectionError, ConnectionErrorCode} from '../src/error/connection-error.js';

describe('Connection', () => {
	const server = createServer();
	let address: AddressInfo;
	const inbound = new EventEmitter();

	beforeAll(async () => {
		server.listen();
		await once(server, 'listening');
		address = server.address() as AddressInfo;

		server.on('connection', (sock) => {
			sock.on('data', (data) => {
				inbound.emit('data', data);
			});
			sock.on('close', () => {
				inbound.emit('close');
			});
		});
	});

	const connections: Connection[] = [];

	function getNewConnection() {
		const conn = new Connection();

		connections.push(conn);
		return conn;
	}

	afterAll(async () => {
		server.close();

		await Promise.all(
			connections
				.filter((connection) => connection.getState() !== 'closed' && connection.getState() !== 'closing')
				.map(async (connection) => connection.close()),
		);
	});

	it('should be defined', () => {
		expect(Connection).toBeDefined();
	});

	it('should be creatable by `new`', () => {
		const conn = getNewConnection();

		expect(conn).toBeDefined();
		expect(conn).toBeInstanceOf(Connection);
	});

	describe('connection.open()', () => {
		it('should connect to the given remote', async () => {
			const conn = getNewConnection();
			await conn.open(address.port, address.address);

			expect(conn.getState()).toBe('open');
		});

		it('should throw on attempt to twice open connection to given remote', async () => {
			const conn = getNewConnection();
			await conn.open(address.port, address.address);
			expect(conn.getState()).toBe('open');

			const rejected = conn.open(address.port, address.address);

			await expect(rejected).rejects.toBeInstanceOf(ConnectionError);
			await expect(rejected).rejects.toHaveProperty('code', ConnectionErrorCode.ErrAlreadyOpened);
		});

		it('should throw on attempt to connect while opening or closing connection', async () => {
			const conn = getNewConnection();
			void conn.open(address.port, address.address);
			const rejected = conn.open(address.port, address.address);

			await expect(rejected).rejects.toBeInstanceOf(ConnectionError);
			await expect(rejected).rejects.toHaveProperty('code', ConnectionErrorCode.ErrChangingState);
		});
	});

	describe('connection.close()', () => {
		it('should connect to the given remote', async () => {
			const conn = getNewConnection();
			await conn.open(address.port, address.address);
			await conn.close();
			expect(conn.getState()).toBe('closed');
		});

		it('should throw on attempt to twice close connection', async () => {
			const conn = getNewConnection();
			await conn.open(address.port, address.address);
			await conn.close();
			expect(conn.getState()).toBe('closed');

			const rejected = conn.close();

			await expect(rejected).rejects.toBeInstanceOf(ConnectionError);
			await expect(rejected).rejects.toHaveProperty('code', ConnectionErrorCode.ErrAlreadyClosed);
		});

		it('should throw on attempt to connect while opening or closing connection', async () => {
			const conn = getNewConnection();
			void conn.open(address.port, address.address);
			const rejected = conn.close();

			await expect(rejected).rejects.toBeInstanceOf(ConnectionError);
			await expect(rejected).rejects.toHaveProperty('code', ConnectionErrorCode.ErrChangingState);
		});
	});

	describe('connection.write()', () => {
		it('should throw in case of calling on unopened connection', async () => {
			const conn = getNewConnection();

			const rejected = conn.write(Buffer.from('hey!'));

			await expect(rejected).rejects.toBeInstanceOf(ConnectionError);
			await expect(rejected).rejects.toHaveProperty('code', ConnectionErrorCode.ErrNotOpened);
		});

		it('should write given buffer to underlying socket', async () => {
			const conn = getNewConnection();
			await conn.open(address.port, address.address);
			const received = once(inbound, 'data');
			const sendBuffer = Buffer.from('hey!');

			await conn.write(sendBuffer);

			await expect(received).resolves.toStrictEqual([sendBuffer]);
		});
	});

	describe('Symbol.asyncDispose', () => {
		it('closes an open connection on scope exit', async () => {
			const conn = getNewConnection();

			{
				await using scoped = conn;
				await scoped.open(address.port, address.address);
				expect(scoped.getState()).toBe('open');
			}

			expect(conn.getState()).toBe('closed');
		});

		it('does nothing on a closed connection', async () => {
			const conn = getNewConnection();

			await expect(conn[Symbol.asyncDispose]()).resolves.toBeUndefined();
			expect(conn.getState()).toBe('closed');
		});

		it('does nothing on a connection that is still opening', async () => {
			const conn = getNewConnection();
			const opening = conn.open(address.port, address.address);
			const opened = (async () => {
				await opening;

				return 'opened';
			})();
			const disposed = (async () => {
				await conn[Symbol.asyncDispose]();

				return 'disposed';
			})();

			await expect(Promise.race([disposed, opened])).resolves.toBe('disposed');
			await opening;
			expect(conn.getState()).toBe('open');
			await conn.close();
		});

		it('does nothing on a connection that is already closing', async () => {
			const conn = getNewConnection();
			await conn.open(address.port, address.address);
			const peerClosed = new Promise<void>((resolve) => {
				inbound.once('close', resolve);
			});
			const closing = conn.close();
			const closed = (async () => {
				await closing;

				return 'closed';
			})();
			const disposed = (async () => {
				await conn[Symbol.asyncDispose]();

				return 'disposed';
			})();

			await expect(Promise.race([disposed, closed])).resolves.toBe('disposed');
			await closing;
			await peerClosed;
			expect(conn.getState()).toBe('closed');
		});
	});

	describe('events', () => {
		it('should emit `open` event on connection opened', async () => {
			const conn = getNewConnection();
			const opened = once(conn, 'open');

			await conn.open(address.port, address.address);

			await expect(opened).resolves.toStrictEqual([expect.any(Number), expect.any(String)]);
			await conn.close();
		});

		it('should emit `close` event on connection close', async () => {
			const conn = getNewConnection();
			const closed = once(conn, 'close');

			await conn.open(address.port, address.address);
			await conn.close();

			await expect(closed).resolves.toStrictEqual([]);
		});
	});
});
