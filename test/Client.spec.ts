import { Buffer } from 'buffer';
import { Connection, ConnectionState } from '../src/Connection';
import { Client } from '../src';
import { ClientError, ClientErrorCode } from '../src/error/ClitenError';
import { JsonSerializer } from '../src/serializer/JsonSerializer';
import { Command } from '../src/Command';
import { BeanstalkCommand, BeanstalkResponseStatus } from '../src/types';
import SpyInstance = jest.SpyInstance;

class ConnectionMock extends Connection {
  public getState = jest.fn((): ConnectionState => 'closed');

  public close = jest.fn(async () => {});

  public isChangingState = jest.fn(() => false);

  public open = jest.fn(async (port: number, host?: string) => {});

  public write = jest.fn(async <T extends Buffer>(buffer: T): Promise<T> => buffer);
}

describe('Client', () => {
  it('should be defined', () => {
    expect(Client).toBeDefined();
    // eslint-disable-next-line no-new
    new Client();
  });

  describe('connect', () => {
    it('should call underlying connection.open with configured host and port', async () => {
      const conn = new ConnectionMock();
      conn.getState.mockReturnValue('closed');
      const c = new Client({ host: 'example.com', port: 1234 }, conn);

      await c.connect();

      expect(conn.open).toHaveBeenCalledTimes(1);
      expect(conn.open).toHaveBeenCalledWith(1234, 'example.com');
    });

    it('should create queue item', async (done) => {
      const conn = new ConnectionMock();
      conn.getState.mockReturnValue('closed');
      const c = new Client(undefined, conn);

      c.connect().then(() => {
        expect(c.queueSize).toBe(0);

        done();
      });

      expect(c.queueSize).toBe(1);
    });

    it('should throw in case of calling while connection is not closed', async () => {
      const conn = new ConnectionMock();
      conn.getState.mockReturnValue('open');
      const c = new Client(undefined, conn);

      try {
        await c.connect();
        throw new Error('not thrown!');
      } catch (e) {
        expect(e).toBeInstanceOf(ClientError);
        expect(e.code).toBe(ClientErrorCode.ErrConnectionNotClosed);
      }
    });
  });

  describe('disconnect', () => {
    it('should call underlying connection.close', async () => {
      const conn = new ConnectionMock();
      conn.getState.mockReturnValue('open');
      const c = new Client(undefined, conn);

      expect(c.queueSize).toBe(0);
      await c.disconnect();

      expect(conn.close).toHaveBeenCalledTimes(1);
    });

    it('should throw in case of calling while connection is not open', async () => {
      const conn = new ConnectionMock();
      conn.getState.mockReturnValue('opening');
      const c = new Client(undefined, conn);

      try {
        await c.disconnect();
        throw new Error('not thrown!');
      } catch (e) {
        expect(e).toBeInstanceOf(ClientError);
        expect(e.code).toBe(ClientErrorCode.ErrConnectionNotOpened);
      }
    });

    it('force disconnect should clear current queue and reject all queued promises', async (done) => {
      const conn = new ConnectionMock();
      conn.getState.mockReturnValue('open');
      const c = new Client(undefined, conn);

      c.bury(123);

      c.bury(123)
        .then(() => {
          throw new Error('not thrown!');
        })
        .catch((e) => {
          expect(e).toBeInstanceOf(ClientError);
          expect(e.code).toBe(ClientErrorCode.ErrDisconnecting);
        });
      c.bury(123)
        .then(() => {
          throw new Error('not thrown!');
        })
        .catch((e) => {
          expect(e).toBeInstanceOf(ClientError);
          expect(e.code).toBe(ClientErrorCode.ErrDisconnecting);
        });

      expect(c.queueSize).toBe(3);
      c.disconnect(true).then(() => {
        expect(c.queueSize).toBe(0);
        done();
      });

      expect(c.queueSize).toBe(2);

      setTimeout(() => {
        conn.emit('data', Buffer.from('BURIED\r\n'));
      }, 20);
    });
  });

  describe('Client.payloadToBuffer', () => {
    describe('with serializer', () => {
      const conn = new ConnectionMock();
      conn.getState.mockReturnValue('open');
      const serializer = new JsonSerializer();
      const c = new Client({ serializer, maxPayloadSize: 20 }, conn);

      const serializeSpy = jest.spyOn(serializer, 'serialize');

      // eslint-disable-next-line @typescript-eslint/dot-notation,prefer-destructuring
      const payloadToBuffer = c['payloadToBuffer'].bind(c);

      it('should use serializer defined on client construct', () => {
        payloadToBuffer('some value');
        expect(serializeSpy).toHaveBeenCalledTimes(1);
      });

      const tableTests: Array<{
        name: string;
        in: Parameters<typeof payloadToBuffer>;
        out: ReturnType<typeof payloadToBuffer>;
      }> = [
        {
          name: 'undefined',
          in: [undefined],
          out: undefined,
        },
        {
          name: 'number',
          in: [123],
          out: Buffer.from(`${JSON.stringify(123)}`),
        },
        {
          name: 'string',
          in: ['some value'],
          out: Buffer.from(`${JSON.stringify('some value')}`),
        },
        {
          name: 'mixed object',
          in: [{ baz: ['bax', 123] }],
          out: Buffer.from(`${JSON.stringify({ baz: ['bax', 123] })}`),
        },
      ];

      // eslint-disable-next-line no-restricted-syntax
      for (const test of tableTests) {
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        it(test.name, () => {
          expect(payloadToBuffer(...test.in)).toStrictEqual(test.out);
        });
      }

      it('should throw in case serialized payload buffer bigger that configured', () => {
        try {
          payloadToBuffer('abcsfkdfjhasdkjfhaskjdhfksajhfd');
          throw new Error('not thrown!');
        } catch (e) {
          expect(e).toBeInstanceOf(ClientError);
          expect(e.code).toBe(ClientErrorCode.ErrPayloadTooBig);
        }
      });
    });

    describe('without serializer', () => {
      const conn = new ConnectionMock();
      const c = new Client({ serializer: undefined, maxPayloadSize: 20 }, conn);

      // eslint-disable-next-line @typescript-eslint/dot-notation,prefer-destructuring
      const payloadToBuffer = c['payloadToBuffer'].bind(c);

      const tableTests: Array<{
        name: string;
        in: Parameters<typeof payloadToBuffer>;
        out: ReturnType<typeof payloadToBuffer>;
      }> = [
        {
          name: 'undefined',
          in: [undefined],
          out: undefined,
        },
        {
          name: 'string',
          in: ['some value'],
          out: Buffer.from('some value'),
        },
      ];

      // eslint-disable-next-line no-restricted-syntax
      for (const test of tableTests) {
        // eslint-disable-next-line @typescript-eslint/no-loop-func
        it(test.name, () => {
          expect(payloadToBuffer(...test.in)).toStrictEqual(test.out);
        });
      }

      it('should throw in case non-string payload received', () => {
        try {
          payloadToBuffer(123);
          throw new Error('not thrown!');
        } catch (e) {
          expect(e).toBeInstanceOf(ClientError);
          expect(e.code).toBe(ClientErrorCode.ErrInvalidPayload);
        }

        try {
          payloadToBuffer({ baz: ['bax', 123] });
          throw new Error('not thrown!');
        } catch (e) {
          expect(e).toBeInstanceOf(ClientError);
          expect(e.code).toBe(ClientErrorCode.ErrInvalidPayload);
        }
      });

      it('should throw in case received payload buffer bigger that configured', () => {
        try {
          payloadToBuffer('abcsfkdfjhasdkjfhaskjdhfksajhfd');
          throw new Error('not thrown!');
        } catch (e) {
          expect(e).toBeInstanceOf(ClientError);
          expect(e.code).toBe(ClientErrorCode.ErrPayloadTooBig);
        }
      });
    });

    describe('readCommandResponse', () => {
      const conn = new ConnectionMock();
      const c = new Client({}, conn);

      // eslint-disable-next-line @typescript-eslint/dot-notation,prefer-destructuring
      const readCommandResponse = c['readCommandResponse'].bind(c);

      it('should read header even if it came in chunks', (done) => {
        readCommandResponse().then((res) => {
          expect(res.status).toBe('WATCHING');
          expect(res.headers).toStrictEqual(['23']);
          expect(res.data).toBeUndefined();
          done();
        });

        conn.emit('data', Buffer.from('WATCH'));
        conn.emit('data', Buffer.from('ING 23'));
        conn.emit('data', Buffer.from('\r\n'));
      });

      it('should read data for data responses', (done) => {
        const dataBuffer = Buffer.from('node-beanstalk is awesome');
        const dataBufferWithNl = Buffer.concat([dataBuffer, Buffer.from('\r\n')]);

        readCommandResponse().then((res) => {
          expect(res.status).toBe('OK');
          expect(res.headers).toStrictEqual([]);
          expect(res.data).toStrictEqual(dataBufferWithNl);
          done();
        });

        conn.emit('data', Buffer.from(`OK ${dataBuffer.length}\r\n`));
        conn.emit('data', dataBufferWithNl);
      });

      it('should throw in case response data not received during configured timeout', (done) => {
        readCommandResponse().catch((e) => {
          expect(e).toBeInstanceOf(ClientError);
          expect(e.code).toBe(ClientErrorCode.ErrResponseRead);
          done();
        });

        conn.emit('data', Buffer.from(`OK 100500\r\n`));
      });
    });

    describe('dispatchCommand', () => {
      const conn = new ConnectionMock();
      const c = new Client({}, conn);

      // @ts-expect-error we're mocking private method so obviously TS is unhappy.
      const readCommandResponseMock = jest.spyOn(c, 'readCommandResponse') as SpyInstance<
        ReturnType<Client['readCommandResponse']>,
        Parameters<Client['readCommandResponse']>
      >;
      readCommandResponseMock.mockImplementation(async () => ({
        status: BeanstalkResponseStatus.BURIED,
        headers: [],
        data: undefined,
      }));
      // eslint-disable-next-line @typescript-eslint/dot-notation,prefer-destructuring
      const dispatchCommand = c['dispatchCommand'].bind(c);

      it('should throw in case of calling while connection is not opened', async () => {
        await dispatchCommand(new Command(BeanstalkCommand.bury))
          .then(() => {
            throw new Error('not thrown!');
          })
          .catch((e) => {
            expect(e).toBeInstanceOf(ClientError);
            expect(e.code).toBe(ClientErrorCode.ErrConnectionNotOpened);
          });
      });
    });
  });
});
