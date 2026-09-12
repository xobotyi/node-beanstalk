import EventEmitter from 'node:events';
import {setTimeout as sleep} from 'node:timers/promises';
import {beforeEach, describe, expect, it, vi, type MockedClass} from 'vite-plus/test';
import {PoolClient} from '../src/PoolClient.js';
import {Pool} from '../src/index.js';
import {PoolError} from '../src/error/PoolError.js';

vi.mock('../src/PoolClient');

class PoolClientMock extends EventEmitter {
	releaseClient = vi.fn<() => void>(() => {
		this.emit('release', this);
	});

	connect = vi.fn<() => Promise<void>>(async () => {});

	disconnect = vi.fn<() => Promise<void>>(async () => {});
}

describe('Pool', () => {
	const PC = PoolClient as MockedClass<typeof PoolClient>;
	const asMock = (client: PoolClient): PoolClientMock => client as unknown as PoolClientMock;

	beforeEach(() => {
		PC.mockImplementation(function () {
			// oxlint-disable-next-line typescript/strict-void-return -- vitest hands out the object a constructor mock returns
			return new PoolClientMock();
		});
		PC.mockClear();
		for (const i of PC.mock.instances) {
			i.releaseClient();
		}
	});

	it('should be defined', () => {
		expect(Pool).toBeDefined();
		expect(() => new Pool()).not.toThrow();
	});

	it('.capacity should return configured capacity of the pool', () => {
		let p = new Pool();
		expect(p.capacity).toBe(10);

		p = new Pool({capacity: 2});
		expect(p.capacity).toBe(2);
	});

	it('.getState should return actual state of the pool', async () => {
		const p = new Pool();
		expect(p.getState()).toBe('live');

		const disconnected = p.disconnect();
		expect(p.getState()).toBe('disconnecting');

		await disconnected;
		expect(p.getState()).toBe('disconnected');
	});

	describe('.connect', () => {
		it('should return PoolClient instance', async () => {
			const p = new Pool({capacity: 2});
			expect(await p.connect()).toBeInstanceOf(PoolClientMock);
		});

		it('should create clients on demand', () => {
			const p = new Pool({capacity: 3});
			expect(PC.mock.instances.length).toBe(0);
			void p.connect();
			expect(PC.mock.instances.length).toBe(1);
			void p.connect();
			expect(PC.mock.instances.length).toBe(2);
			void p.connect();
			expect(PC.mock.instances.length).toBe(3);
		});

		it('should connect created clients', async () => {
			const p = new Pool({capacity: 2});

			const client = asMock(await p.connect());

			expect(client.connect).toHaveBeenCalledTimes(1);
		});

		it('should put connect requests to fifo queue', async () => {
			const p = new Pool({capacity: 2});

			const arr: number[] = [];
			const holdClient = async (mark: number, ms: number): Promise<void> => {
				const c = await p.connect();
				await sleep(ms);
				arr.push(mark);
				c.releaseClient();
			};

			const held = [holdClient(1, 300), holdClient(2, 100)];

			expect(p.idleCount).toBe(0);
			expect(p.waitingCount).toBe(0);

			held.push(holdClient(3, 100), holdClient(4, 100));

			expect(p.idleCount).toBe(0);
			expect(p.waitingCount).toBe(2);

			await Promise.all(held);
			expect(arr).toStrictEqual([2, 3, 1, 4]);
		});

		it('should throw in case called on disconnected pool', async () => {
			const p = new Pool({capacity: 2});

			await p.disconnect();

			await expect(p.connect()).rejects.toBeInstanceOf(PoolError);
		});
	});

	describe('.disconnect', () => {
		it('should throw in case called on disconnected pool', async () => {
			const p = new Pool({capacity: 2});

			await p.disconnect();

			await expect(p.disconnect()).rejects.toBeInstanceOf(PoolError);
		});

		it('should change disconnect state', async () => {
			const p = new Pool({capacity: 2});

			expect(p.getState()).toBe('live');
			const disconnected = p.disconnect();
			expect(p.getState()).toBe('disconnecting');

			await disconnected;
			expect(p.getState()).toBe('disconnected');
		});

		it('should disconnect each client', async () => {
			const p = new Pool({capacity: 2});

			const c1 = asMock(await p.connect());
			const c2 = asMock(await p.connect());

			c1.releaseClient();
			c2.releaseClient();

			await p.disconnect();

			expect(c1.disconnect).toHaveBeenCalledTimes(1);
			expect(c2.disconnect).toHaveBeenCalledTimes(1);
		});

		it('should reject pending requests and force disconnect clients in case of force disconnect', async () => {
			const p = new Pool({capacity: 2});

			const c1 = asMock(await p.connect());
			const c2 = asMock(await p.connect());
			const c3 = p.connect();
			const c4 = p.connect();

			await p.disconnect(true);

			expect(c1.disconnect).toHaveBeenCalledWith(true);
			expect(c2.disconnect).toHaveBeenCalledWith(true);

			await expect(c3).rejects.toStrictEqual(new PoolError('Unable to gain client, pool is disconnecting.'));
			await expect(c4).rejects.toStrictEqual(new PoolError('Unable to gain client, pool is disconnecting.'));
		});

		it('should await queue resolve during non-forced disconnect', async () => {
			const p = new Pool({capacity: 2});

			const arr: number[] = [];

			const c1 = await p.connect();
			const c2 = await p.connect();
			const connectMarked = async (mark: number): Promise<PoolClient> => {
				const c = await p.connect();
				arr.push(mark);
				return c;
			};
			const disconnectMarked = async (mark: number): Promise<void> => {
				await p.disconnect();
				arr.push(mark);
			};
			const p3 = connectMarked(3);
			const p4 = connectMarked(4);
			const p5 = disconnectMarked(5);

			c1.releaseClient();
			c2.releaseClient();

			const c3 = await p3;
			const c4 = await p4;

			c3.releaseClient();
			c4.releaseClient();

			await p5;

			expect(arr).toStrictEqual([3, 4, 5]);
		});
	});

	describe('.restore', () => {
		it('should throw in case called on live pool', () => {
			const p = new Pool({capacity: 2});

			expect(() => {
				p.restore();
			}).toThrow(PoolError);
		});

		it('should restore disconnected pool back to live', async () => {
			const p = new Pool({capacity: 2});
			await p.disconnect();
			expect(p.getState()).toBe('disconnected');
			p.restore();

			expect(p.getState()).toBe('live');
		});
	});
});
