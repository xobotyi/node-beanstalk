import { AddressInfo, createServer, Server, Socket } from 'net';
import { setImmediate } from 'node:timers/promises';
import { Connection } from '../src/Connection';
import { ConnectionError } from '../src/error/ConnectionError';

describe('Connection', () => {
  const server = createServer();
  let address: AddressInfo;
  let serverSocket: Socket;

  beforeAll((done) => {
    server.listen(() => {
      address = server.address() as AddressInfo;

      server.on('connection', (sock) => {
        serverSocket = sock;
      });
      done();
    });
  });

  const connections: Connection[] = [];

  function getNewConnection() {
    const conn = new Connection();

    connections.push(conn);
    return conn;
  }

  const ownServers: Server[] = [];

  async function listen(onConnection?: (sock: Socket) => void): Promise<AddressInfo> {
    const own = createServer(onConnection);
    ownServers.push(own);
    await new Promise<void>((resolve) => {
      own.listen(resolve);
    });
    return own.address() as AddressInfo;
  }

  afterAll(() => {
    ownServers.forEach((own) => own.close());
  });

  afterAll(async () => {
    server.close();

    // eslint-disable-next-line no-restricted-syntax
    for await (const connection of connections) {
      if (connection.getState() !== 'closed' && connection.getState() !== 'closing')
        await connection.close();
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
        .catch((err: ConnectionError) => {
          expect(err).toBeInstanceOf(ConnectionError);
          expect(err.code).toBe('ErrAlreadyOpened');
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
        .catch((err: ConnectionError) => {
          expect(err).toBeInstanceOf(ConnectionError);
          expect(err.code).toBe('ErrChangingState');
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
        .catch((err: ConnectionError) => {
          expect(err).toBeInstanceOf(ConnectionError);
          expect(err.code).toBe('ErrAlreadyClosed');
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
        .catch((err: ConnectionError) => {
          expect(err).toBeInstanceOf(ConnectionError);
          expect(err.code).toBe('ErrChangingState');
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
        .catch((err: ConnectionError) => {
          expect(err).toBeInstanceOf(ConnectionError);
          expect(err.code).toBe('ErrNotOpened');
        });
    });

    if (process.env.CI === undefined) {
      // somewhy this test fails on CI
      // ToDo: investigate later
      it('should write given buffer to underlying socket', (done) => {
        const conn = getNewConnection();
        conn.open(address.port, address.address).then(() => {
          const sendBuffer = Buffer.from('hey!');

          serverSocket.on('data', async (data) => {
            expect(data).toStrictEqual(sendBuffer);
            done();
          });

          conn.write(sendBuffer);
        });
      });
    }
  });

  describe('events', () => {
    it('should emit `open` event on connection opened', (done) => {
      const conn = getNewConnection();
      conn.on('open', async (port, host) => {
        expect(typeof port).toBe('number');
        expect(typeof host).toBe('string');
        await conn.close();
        done();
      });
      conn.open(address.port, address.address);
    });

    it('should emit `close` event on connection close', (done) => {
      const conn = getNewConnection();
      conn.on('close', () => {
        done();
      });
      conn.open(address.port, address.address).then(() => conn.close());
    });
  });

  describe('socket death', () => {
    it('should become `closed` and emit `close` once when the peer destroys the socket', async () => {
      const { port, address: host } = await listen((sock) => sock.destroy());

      const conn = getNewConnection();
      const closeSpy = jest.fn();
      conn.on('close', closeSpy);

      await conn.open(port, host);
      await new Promise<void>((resolve) => {
        conn.once('close', resolve);
      });
      await setImmediate();

      expect(conn.getState()).toBe('closed');
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('reopen', () => {
    it('should emit `close` once before `close()` resolves when reopened right away', async () => {
      const { port, address: host } = await listen();

      const conn = getNewConnection();
      const closeSpy = jest.fn(() => conn.getState());
      conn.on('close', closeSpy);

      await conn.open(port, host);
      await conn.close();
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(closeSpy).toHaveReturnedWith('closed');
      await conn.open(port, host);
      await setImmediate();

      expect(conn.getState()).toBe('open');
      expect(closeSpy).toHaveBeenCalledTimes(1);

      await conn.close();
      expect(closeSpy).toHaveBeenCalledTimes(2);
    });

    it('should allow `open()` from inside the `close` listener', async () => {
      const { port, address: host } = await listen();

      const conn = getNewConnection();
      let reopened: Promise<void> | undefined;
      conn.once('close', () => {
        reopened = conn.open(port, host);
      });

      await conn.open(port, host);
      await conn.close();
      await expect(reopened).resolves.toBeUndefined();

      expect(conn.getState()).toBe('open');
      await conn.close();
    });
  });
  describe('connect timeout', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should reject with `ErrConnectTimeout`, emit `close` and end `closed` when the dial never lands', async () => {
      // A dial into a black hole: no callback, no error. Faked, because a local server always answers.
      const connectSpy = jest
        .spyOn(Socket.prototype, 'connect')
        .mockImplementationOnce(function connect(this: Socket) {
          return this;
        });
      const conn = getNewConnection();
      const closeSpy = jest.fn(() => conn.getState());
      conn.on('close', closeSpy);

      const started = Date.now();
      await expect(conn.open(address.port, address.address, 50)).rejects.toMatchObject({
        name: 'ConnectionError',
        code: 'ErrConnectTimeout',
        message: 'Connection not established within 50 ms',
      });
      expect(Date.now() - started).toBeLessThan(1000);
      expect(conn.getState()).toBe('closed');
      expect(closeSpy).toHaveBeenCalledTimes(1);
      expect(closeSpy).toHaveReturnedWith('closed');
      expect(connectSpy.mock.instances[0].destroyed).toBe(true);

      await conn.open(address.port, address.address);
      expect(conn.getState()).toBe('open');
      await conn.close();
    });

    it('should settle `open()` when `destroy()` runs while opening', async () => {
      jest
        .spyOn(Socket.prototype, 'connect')
        .mockImplementationOnce(function connect(this: Socket) {
          return this;
        });
      const conn = getNewConnection();
      const closeSpy = jest.fn();
      conn.on('close', closeSpy);

      const opening = conn.open(address.port, address.address);
      expect(conn.getState()).toBe('opening');
      conn.destroy();

      await expect(opening).rejects.toMatchObject({
        name: 'ConnectionError',
        code: 'ErrNotOpened',
      });
      expect(conn.getState()).toBe('closed');
      await setImmediate();
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });
  });
});
