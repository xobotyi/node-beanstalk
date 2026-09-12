import {afterAll, beforeAll, describe, expect, it} from 'vite-plus/test';
import {EventEmitter} from 'node:events';
import {type AddressInfo, createServer} from 'node:net';
import {Connection} from '../src/Connection.js';
import {ConnectionError} from '../src/error/ConnectionError.js';

describe('Connection', () => {
	const server = createServer();
	let address: AddressInfo;
	const inbound = new EventEmitter();

	beforeAll(async () => {
		await new Promise<void>((resolve) => server.listen(resolve));
		address = server.address() as AddressInfo;

		server.on('connection', (sock) => {
			sock.on('data', (data) => inbound.emit('data', data));
			sock.on('close', () => inbound.emit('close'));
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

		for (const connection of connections) {
			if (connection.getState() !== 'closed' && connection.getState() !== 'closing') await connection.close();
		}
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

			await conn
				.open(address.port, address.address)
				.then(() => {
					throw new Error('not thrown!');
				})
				.catch((error: ConnectionError) => {
					expect(error).toBeInstanceOf(ConnectionError);
					expect(error.code).toBe('ErrAlreadyOpened');
				});
		});

		it('should throw on attempt to connect while opening or closing connection', async () => {
			const conn = getNewConnection();
			conn.open(address.port, address.address);
			await conn
				.open(address.port, address.address)
				.then(() => {
					throw new Error('not thrown!');
				})
				.catch((error: ConnectionError) => {
					expect(error).toBeInstanceOf(ConnectionError);
					expect(error.code).toBe('ErrChangingState');
				});
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

			await conn
				.close()
				.then(() => {
					throw new Error('not thrown!');
				})
				.catch((error: ConnectionError) => {
					expect(error).toBeInstanceOf(ConnectionError);
					expect(error.code).toBe('ErrAlreadyClosed');
				});
		});

		it('should throw on attempt to connect while opening or closing connection', async () => {
			const conn = getNewConnection();
			conn.open(address.port, address.address);
			await conn
				.close()
				.then(() => {
					throw new Error('not thrown!');
				})
				.catch((error: ConnectionError) => {
					expect(error).toBeInstanceOf(ConnectionError);
					expect(error.code).toBe('ErrChangingState');
				});
		});
	});

	describe('connection.write()', () => {
		it('should throw in case of calling on unopened connection', async () => {
			const conn = getNewConnection();

			await conn
				.write(Buffer.from('hey!'))
				.then(() => {
					throw new Error('not thrown!');
				})
				.catch((error: ConnectionError) => {
					expect(error).toBeInstanceOf(ConnectionError);
					expect(error.code).toBe('ErrNotOpened');
				});
		});

		it('should write given buffer to underlying socket', async () => {
			const conn = getNewConnection();
			await conn.open(address.port, address.address);
			const received = new Promise((resolve) => inbound.once('data', resolve));
			const sendBuffer = Buffer.from('hey!');

			await conn.write(sendBuffer);

			await expect(received).resolves.toStrictEqual(sendBuffer);
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
			const opened = new Promise<unknown[]>((resolve) =>
				conn.on('open', (...args) => {
					resolve(args);
				}),
			);

			await conn.open(address.port, address.address);

			const [port, host] = await opened;
			expect(typeof port).toBe('number');
			expect(typeof host).toBe('string');
			await conn.close();
		});

		it('should emit `close` event on connection close', async () => {
			const conn = getNewConnection();
			const closed = new Promise<void>((resolve) => conn.on('close', resolve));

			await conn.open(address.port, address.address);
			await conn.close();

			await closed;
		});
	});
});
