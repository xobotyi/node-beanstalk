/* eslint-disable import/first */

import EventEmitter, { once } from 'events';
import { AddressInfo, createServer, Server, Socket } from 'net';
import { setTimeout as sleep } from 'node:timers/promises';
import { PoolClient } from '../src/PoolClient';
import { Pool } from '../src';
import { PoolError } from '../src/error/PoolError';
import { ClientErrorCode } from '../src/error/ClientError';

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

  /**
   * A connection reaches `open` only against a real peer, and a peer is the only honest way
   * to kill it from the outside. So these tests use real clients against a local server that
   * plays a minimal broker: it answers `put` with `INSERTED`, and it can go silent.
   */
  describe('connection death', () => {
    const { PoolClient: RealPoolClient } = jest.requireActual('../src/PoolClient');

    let server: Server;
    let sockets: Socket[];
    let respond: boolean;
    let host: string;
    let port: number;
    let pools: Pool[];

    beforeEach(async () => {
      PC.mockImplementation((...args) => new RealPoolClient(...args));

      respond = true;
      sockets = [];
      pools = [];

      server = createServer((socket) => {
        sockets.push(socket);
        socket.on('data', (data) => {
          if (respond && data.toString().startsWith('put ')) {
            socket.write('INSERTED 1\r\n');
          }
        });
      });
      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', resolve);
      });
      ({ address: host, port } = server.address() as AddressInfo);
    });

    afterEach(async () => {
      await Promise.all(pools.map((p) => p.disconnect(true).catch(() => undefined)));
      sockets.forEach((socket) => socket.destroy());
      await new Promise((resolve) => {
        server.close(resolve);
      });
    });

    function newPool(capacity = 1, commandTimeoutMs = 0): Pool {
      const p = new Pool({ capacity, clientOptions: { host, port, commandTimeoutMs } });
      pools.push(p);
      return p;
    }

    /** The server's `connection` event lands a tick after `pool.connect()` resolves. */
    async function connectAccepted(p: Pool): Promise<[PoolClient, Socket]> {
      const accepted = once(server, 'connection');
      const client = await p.connect();
      const [socket] = await accepted;
      return [client, socket];
    }

    /** Kill the broker side of a connection and wait until the client noticed. */
    async function killConnection(client: PoolClient, socket: Socket): Promise<void> {
      const closed = new Promise<void>((resolve) => {
        client.once('close', resolve);
      });
      socket.destroy();
      await closed;
    }

    async function stillQueued(reservation: Promise<unknown>): Promise<boolean> {
      const outcome = await Promise.race([reservation, sleep(50, 'still queued')]);
      return outcome === 'still queued';
    }

    it('replaces a client whose connection died while idle', async () => {
      const p = newPool();
      const [first, socket] = await connectAccepted(p);
      await expect(first.put('job')).resolves.toMatchObject({ id: 1 });
      first.releaseClient();

      await killConnection(first, socket);
      expect(p.idleCount).toBe(0);

      const second = await p.connect();
      expect(second).not.toBe(first);
      await expect(second.put('job')).resolves.toMatchObject({ id: 1 });
      expect(sockets).toHaveLength(2);
    });

    it('hands a waiter a fresh connection when the reserved client dies', async () => {
      const p = newPool();
      const [holder, socket] = await connectAccepted(p);
      const waiting = p.connect();
      expect(p.waitingCount).toBe(1);

      await killConnection(holder, socket);

      const client = await waiting;
      expect(client).not.toBe(holder);
      await expect(client.put('job')).resolves.toMatchObject({ id: 1 });
      expect(sockets).toHaveLength(2);
    });

    it('drops a dead client that its holder releases back', async () => {
      const p = newPool();
      const [client, socket] = await connectAccepted(p);

      await killConnection(client, socket);
      client.releaseClient();
      expect(p.idleCount).toBe(0);

      const next = await p.connect();
      expect(next).not.toBe(client);
      await expect(next.put('job')).resolves.toMatchObject({ id: 1 });
      expect(sockets).toHaveLength(2);
    });

    it('keeps a client that died under a command out of the pool when its holder releases it', async () => {
      const p = newPool();
      const [client, socket] = await connectAccepted(p);

      // An RST and then a put in one tick: the write fails and the command rejects on its
      // own, and the release runs in that rejection's microtask, before the `close` event.
      socket.resetAndDestroy();

      const next = await client.put('job').then(
        () => {
          throw new Error('the put resolved on a socket the broker had reset');
        },
        () => {
          client.releaseClient();
          return p.connect();
        }
      );

      expect(next).not.toBe(client);
      await expect(next.put('job')).resolves.toMatchObject({ id: 1 });
    });

    it('rejects every queued waiter when the broker goes down', async () => {
      const p = newPool();
      const [, heldSocket] = await connectAccepted(p);
      const firstWaiter = p.connect();
      const secondWaiter = p.connect();
      firstWaiter.catch(() => undefined);
      secondWaiter.catch(() => undefined);

      server.close();
      heldSocket.destroy();

      await expect(firstWaiter).rejects.toMatchObject({ code: 'ECONNREFUSED' });
      await expect(secondWaiter).rejects.toMatchObject({ code: 'ECONNREFUSED' });
      expect(p.waitingCount).toBe(0);
    });

    it('hands out distinct clients after a double release', async () => {
      const p = newPool();
      const client = await p.connect();

      // A persistent release listener would put the client on the idle list twice, and the
      // second reservation below would then hold the same client as the first.
      client.releaseClient();
      client.releaseClient();
      expect(p.idleCount).toBe(1);

      const first = await p.connect();
      expect(first).toBe(client);

      const second = p.connect();
      expect(await stillQueued(second)).toBe(true);
      expect(p.waitingCount).toBe(1);

      first.releaseClient();
      expect(await second).toBe(client);
    });

    it('keeps a double-released client away from the idle list while a waiter holds it', async () => {
      const p = newPool();
      const holder = await p.connect();
      const waiting = p.connect();

      holder.releaseClient();
      holder.releaseClient();

      const waiterClient = await waiting;
      expect(waiterClient).toBe(holder);
      expect(p.idleCount).toBe(0);

      const reservation = p.connect();
      reservation.catch(() => undefined);

      expect(await stillQueued(reservation)).toBe(true);
    });

    it('rejects a command the broker never answers and drops the client', async () => {
      respond = false;
      const p = newPool(1, 50);
      const client = await p.connect();

      await expect(client.put('job')).rejects.toMatchObject({
        code: ClientErrorCode.ErrCommandTimeout,
      });

      const [next] = await connectAccepted(p);
      expect(next).not.toBe(client);
      expect(sockets).toHaveLength(2);
    });

    it('finishes a graceful disconnect and rejects the waiter when the broker goes down', async () => {
      const p = newPool();
      const [, heldSocket] = await connectAccepted(p);
      const waiting = p.connect();
      waiting.catch(() => undefined);

      const disconnected = p.disconnect();
      expect(p.getState()).toBe('live');

      server.close();
      heldSocket.destroy();

      await expect(waiting).rejects.toBeInstanceOf(PoolError);
      await expect(disconnected).resolves.toBeUndefined();
      expect(p.getState()).toBe('disconnected');
      expect(sockets).toHaveLength(1);
    });

    it('rejects a reservation made while a graceful disconnect is waiting', async () => {
      const p = newPool();
      const [holder] = await connectAccepted(p);
      const waiting = p.connect();
      waiting.catch(() => undefined);

      const disconnected = p.disconnect();

      await expect(p.connect()).rejects.toStrictEqual(
        new PoolError('Unable to gain client, pool is disconnecting.')
      );

      holder.releaseClient();
      (await waiting).releaseClient();

      await expect(disconnected).resolves.toBeUndefined();
      expect(sockets).toHaveLength(1);
    });

    it('rejects the reservation when the broker is unreachable', async () => {
      await new Promise((resolve) => {
        server.close(resolve);
      });
      const p = newPool();

      await expect(p.connect()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
      await expect(p.connect()).rejects.toMatchObject({ code: 'ECONNREFUSED' });
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
