/* eslint-disable import/first */

import EventEmitter from 'events';
import { PoolClient } from '../src/PoolClient';
import { Pool } from '../src';
import { PoolError } from '../src/error/PoolError';

jest.mock('../src/PoolClient');

class PoolClientMock extends EventEmitter {
  releaseClient = jest.fn((): void => {
    this.emit('release', this);
  });

  connect = jest.fn(() => Promise.resolve());

  disconnect = jest.fn(() => Promise.resolve());
}

describe('Pool', () => {
  const PC = PoolClient as jest.MockedClass<typeof PoolClient>;

  beforeEach(() => {
    PC.mockImplementation(() => new PoolClientMock() as any);
    PC.mockClear();
    PC.mock.instances.forEach((i) => i.releaseClient());
  });

  it('should be defined', () => {
    expect(Pool).toBeDefined();
    // eslint-disable-next-line no-new
    new Pool();
  });

  it('.capacity should return configured capacity of the pool', () => {
    let p = new Pool();
    expect(p.capacity).toBe(10);

    p = new Pool({ capacity: 2 });
    expect(p.capacity).toBe(2);
  });

  it('.getState should return actual state of the pool', (done) => {
    const p = new Pool();
    expect(p.getState()).toBe('live');

    p.disconnect().then(() => {
      expect(p.getState()).toBe('disconnected');
      done();
    });
    expect(p.getState()).toBe('disconnecting');
  });

  describe('.connect', () => {
    it('should return PoolClient instance', async () => {
      const p = new Pool({ capacity: 2 });
      expect(await p.connect()).toBeInstanceOf(PoolClientMock);
    });

    it('should create clients on demand', () => {
      const p = new Pool({ capacity: 3 });
      expect(PC.mock.instances.length).toBe(0);
      p.connect();
      expect(PC.mock.instances.length).toBe(1);
      p.connect();
      expect(PC.mock.instances.length).toBe(2);
      p.connect();
      expect(PC.mock.instances.length).toBe(3);
    });

    it('should connect created clients', async () => {
      const p = new Pool({ capacity: 2 });

      const client = await p.connect();

      expect(client.connect).toHaveBeenCalledTimes(1);
    });

    it('should put connect requests to fifo queue', (done) => {
      const p = new Pool({ capacity: 2 });

      const arr: number[] = [];

      p.connect().then((c) => {
        setTimeout(() => {
          arr.push(1);
          c.releaseClient();
        }, 300);
      });
      p.connect().then((c) => {
        setTimeout(() => {
          arr.push(2);
          c.releaseClient();
        }, 100);
      });

      expect(p.idleCount).toBe(0);
      expect(p.waitingCount).toBe(0);

      p.connect().then((c) => {
        setTimeout(() => {
          arr.push(3);
          c.releaseClient();
        }, 100);
      });
      p.connect().then((c) => {
        setTimeout(() => {
          arr.push(4);
          c.releaseClient();

          expect(arr).toStrictEqual([2, 3, 1, 4]);

          done();
        }, 100);
      });

      expect(p.idleCount).toBe(0);
      expect(p.waitingCount).toBe(2);
    });

    it('should throw in case called on disconnected pool', async () => {
      const p = new Pool({ capacity: 2 });

      await p.disconnect();

      await p
        .connect()
        .then(() => {
          throw new Error('not thrown');
        })
        .catch((err) => {
          expect(err).toBeInstanceOf(PoolError);
        });
    });
  });

  describe('.disconnect', () => {
    it('should throw in case called on disconnected pool', async () => {
      const p = new Pool({ capacity: 2 });

      await p.disconnect();

      await p
        .disconnect()
        .then(() => {
          throw new Error('not thrown');
        })
        .catch((err) => {
          expect(err).toBeInstanceOf(PoolError);
        });
    });

    it('should change disconnect state', (done) => {
      const p = new Pool({ capacity: 2 });

      expect(p.getState()).toBe('live');
      p.disconnect().then(() => {
        expect(p.getState()).toBe('disconnected');
        done();
      });

      expect(p.getState()).toBe('disconnecting');
    });

    it('should disconnect each client', async () => {
      const p = new Pool({ capacity: 2 });

      const c1 = await p.connect();
      const c2 = await p.connect();

      c1.releaseClient();
      c2.releaseClient();

      await p.disconnect();

      expect(c1.disconnect).toHaveBeenCalledTimes(1);
      expect(c2.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should reject pending requests and force disconnect clients in case of force disconnect', async () => {
      const p = new Pool({ capacity: 2 });

      const c1 = await p.connect();
      const c2 = await p.connect();
      const c3 = p.connect();
      const c4 = p.connect();

      await p.disconnect(true);

      expect(c1.disconnect).toHaveBeenCalledWith(true);
      expect(c2.disconnect).toHaveBeenCalledWith(true);

      expect(await c3.catch((e) => e)).toStrictEqual(
        new PoolError('Unable to gain client, pool is disconnecting.')
      );
      expect(await c4.catch((e) => e)).toStrictEqual(
        new PoolError('Unable to gain client, pool is disconnecting.')
      );
    });

    it('should await queue resolve during non-forced disconnect', async () => {
      const p = new Pool({ capacity: 2 });

      const arr: number[] = [];

      const c1 = await p.connect();
      const c2 = await p.connect();
      const p3 = p.connect().then((c) => {
        arr.push(3);
        return c;
      });
      const p4 = p.connect().then((c) => {
        arr.push(4);
        return c;
      });
      const p5 = p.disconnect().then(() => {
        arr.push(5);
      });

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
    it('should throw in case called on live pool', async () => {
      const p = new Pool({ capacity: 2 });

      expect(() => p.restore()).toThrow(PoolError);
    });

    it('should restore disconnected pool back to live', async () => {
      const p = new Pool({ capacity: 2 });
      await p.disconnect();
      expect(p.getState()).toBe('disconnected');
      p.restore();

      expect(p.getState()).toBe('live');
    });
  });
});
