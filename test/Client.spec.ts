/* eslint-disable import/first */
jest.mock('../src/util/validator');

import { Buffer } from 'buffer';
import { BeanstalkError } from '../src/error/BeanstalkError';
import { Connection, ConnectionState } from '../src/Connection';
import { BeanstalkJobState, Client } from '../src';
import { ClientError, ClientErrorCode } from '../src/error/ClientError';
import { JsonSerializer } from '../src/serializer/JsonSerializer';
import { Command } from '../src/Command';
import { BeanstalkCommand, BeanstalkResponseStatus } from '../src/types';
import {
  validateDelay,
  validateJobId,
  validatePriority,
  validateTimeout,
  validateTTR,
  validateTubeName,
} from '../src/util/validator';
import SpyInstance = jest.SpyInstance;

class ConnectionMock extends Connection {
  public getState = jest.fn((): ConnectionState => 'closed');

  public close = jest.fn(async () => {});

  public isChangingState = jest.fn(() => false);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

  describe('isConnected', () => {
    it('should return true in case connection is opened', () => {
      const conn = new ConnectionMock();
      const c = new Client({}, conn);

      conn.getState.mockReturnValueOnce('open');
      expect(c.isConnected).toBe(true);

      conn.getState.mockReturnValueOnce('closed');
      expect(c.isConnected).toBe(false);
      conn.getState.mockReturnValueOnce('closing');
      expect(c.isConnected).toBe(false);
      conn.getState.mockReturnValueOnce('opening');
      expect(c.isConnected).toBe(false);
    });
  });

  describe('isWorking', () => {
    it('should return true in case anything is currently in queue', () => {
      const conn = new ConnectionMock();
      conn.getState.mockReturnValueOnce('open');
      const c = new Client({}, conn);

      expect(c.isWorking).toBe(false);

      // @ts-expect-error we're mocking private method so obviously TS is unhappy.
      const readCommandResponseMock = jest.spyOn(c, 'readCommandResponse') as SpyInstance<
        ReturnType<Client['readCommandResponse']>,
        Parameters<Client['readCommandResponse']>
      >;

      readCommandResponseMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                status: BeanstalkResponseStatus.BURIED,
                headers: ['100500'],
              });
            }, 10);
          })
      );

      c.bury(123, 12);

      expect(c.isWorking).toBe(true);
    });
  });

  describe('queueSize', () => {
    it('should return amount of waiting requests', (done) => {
      const conn = new ConnectionMock();
      conn.getState.mockReturnValueOnce('open');
      const c = new Client({}, conn);

      expect(c.queueSize).toBe(0);

      // @ts-expect-error we're mocking private method so obviously TS is unhappy.
      const readCommandResponseMock = jest.spyOn(c, 'readCommandResponse') as SpyInstance<
        ReturnType<Client['readCommandResponse']>,
        Parameters<Client['readCommandResponse']>
      >;

      readCommandResponseMock.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                status: BeanstalkResponseStatus.BURIED,
                headers: ['100500'],
              });
            }, 10);
          })
      );

      Promise.allSettled([c.bury(123), c.bury(123), c.bury(123), c.bury(123)]).then(() => {
        expect(c.queueSize).toBe(0);
        done();
      });
      expect(c.queueSize).toBe(4);
    });
  });

  describe('payloadToBuffer', () => {
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
    conn.getState.mockReturnValue('open');

    const serializer = new JsonSerializer();
    const c = new Client({ serializer }, conn);

    // @ts-expect-error we're mocking private method so obviously TS is unhappy.
    const readCommandResponseMock = jest.spyOn(c, 'readCommandResponse') as SpyInstance<
      ReturnType<Client['readCommandResponse']>,
      Parameters<Client['readCommandResponse']>
    >;
    // eslint-disable-next-line @typescript-eslint/dot-notation,prefer-destructuring
    const dispatchCommand = c['dispatchCommand'].bind(c);

    const cmd = new Command(BeanstalkCommand.bury, {
      expectedStatus: [BeanstalkResponseStatus.BURIED],
    });
    const buildCommandBufferSpy = jest.spyOn(cmd, 'buildCommandBuffer');
    const handleResponseOrig = cmd.handleResponse;
    const handleResponseSpy = jest.spyOn(cmd, 'handleResponse');

    beforeEach(() => {
      readCommandResponseMock.mockReset();
      readCommandResponseMock.mockImplementation(async () => ({
        status: BeanstalkResponseStatus.BURIED,
        headers: [],
        data: undefined,
      }));

      buildCommandBufferSpy.mockReset();
      handleResponseSpy.mockReset();
      handleResponseSpy.mockImplementation(handleResponseOrig);
    });

    it('should throw in case of calling while connection is not opened', async () => {
      conn.getState.mockReturnValueOnce('closed');
      await dispatchCommand(cmd)
        .then(() => {
          throw new Error('not thrown!');
        })
        .catch((e) => {
          expect(e).toBeInstanceOf(ClientError);
          expect(e.code).toBe(ClientErrorCode.ErrConnectionNotOpened);
        });
    });

    it("should call command's buildCommandBuffer", async () => {
      await dispatchCommand(cmd, ['123', '321'], 'some payload');

      expect(buildCommandBufferSpy).toHaveBeenCalledTimes(1);
      expect(buildCommandBufferSpy).toHaveBeenCalledWith(
        ['123', '321'],
        Buffer.from(serializer.serialize('some payload'))
      );
    });

    it("should return result of command's handleResponse", async () => {
      const result = await dispatchCommand(cmd, ['123', '321'], 'some payload');

      expect(handleResponseSpy).toHaveBeenCalledTimes(1);
      expect(handleResponseSpy).toHaveBeenCalledWith(
        {
          status: BeanstalkResponseStatus.BURIED,
          headers: [],
          data: undefined,
        },
        serializer
      );
      expect(result).toStrictEqual({
        status: BeanstalkResponseStatus.BURIED,
        headers: [],
      });
    });
  });

  describe('commands', () => {
    const conn = new ConnectionMock();
    conn.getState.mockReturnValue('open');

    const serializer = new JsonSerializer();
    const c = new Client(
      {
        serializer,
        defaultTTR: 5,
        defaultPriority: 6,
        defaultDelay: 7,
      },
      conn
    );

    // @ts-expect-error we're mocking private method so obviously TS is unhappy.
    const dispatchCommandMock = jest.spyOn(c, 'dispatchCommand') as SpyInstance<
      ReturnType<Client['dispatchCommand']>,
      Parameters<Client['dispatchCommand']>
    >;

    beforeEach(() => {
      dispatchCommandMock.mockReset();
      (validateTTR as any).mockReset();
      (validatePriority as any).mockReset();
      (validateDelay as any).mockReset();
      (validateTimeout as any).mockReset();
      (validateJobId as any).mockReset();
      (validateTubeName as any).mockReset();
    });

    describe('put', () => {
      it('should validate ttr, priority and delay', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.INSERTED,
            headers: ['100500'],
          })
        );

        await c.put('My payload', 1, 2, 3);

        expect(validateTTR).toHaveBeenCalledTimes(1);
        expect(validateTTR).toHaveBeenCalledWith(1);
        expect(validatePriority).toHaveBeenCalledTimes(1);
        expect(validatePriority).toHaveBeenCalledWith(2);
        expect(validateDelay).toHaveBeenCalledTimes(1);
        expect(validateDelay).toHaveBeenCalledWith(3);
      });

      it("should return job id and it's status", async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.INSERTED,
            headers: ['100500'],
          })
        );

        expect(await c.put('payload', 1, 0, 0)).toStrictEqual({
          id: 100500,
          state: BeanstalkJobState.ready,
        });

        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.INSERTED,
            headers: ['100500'],
          })
        );

        expect(await c.put('payload', 1, 2, 3)).toStrictEqual({
          id: 100500,
          state: BeanstalkJobState.delayed,
        });

        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.BURIED,
            headers: ['100500'],
          })
        );

        expect(await c.put('payload')).toStrictEqual({
          id: 100500,
          state: BeanstalkJobState.buried,
        });
      });

      it('should use default ttr, priority and delay in case it is not defined', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.INSERTED,
            headers: ['100500'],
          })
        );

        await c.put('some payload');

        expect(validateTTR).toHaveBeenCalledTimes(1);
        expect(validateTTR).toHaveBeenCalledWith(5);
        expect(validatePriority).toHaveBeenCalledTimes(1);
        expect(validatePriority).toHaveBeenCalledWith(6);
        expect(validateDelay).toHaveBeenCalledTimes(1);
        expect(validateDelay).toHaveBeenCalledWith(7);
      });

      it('should throw in case of undefined payload received', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.INSERTED,
            headers: ['100500'],
          })
        );

        await c
          .put(undefined)
          .then(() => {
            throw new Error('not thrown');
          })
          .catch((e) => {
            expect(e).toStrictEqual(new TypeError('payload has to be a non-undefined value'));
          });
      });

      it('should throw in case of server error-ish responses', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.JOB_TOO_BIG,
            headers: ['100500'],
          })
        );

        await c
          .put('test')
          .then(() => {
            throw new Error('not thrown');
          })
          .catch((e) => {
            expect(e).toBeInstanceOf(BeanstalkError);
          });
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.EXPECTED_CRLF,
            headers: ['100500'],
          })
        );
        await c
          .put('test')
          .then(() => {
            throw new Error('not thrown');
          })
          .catch((e) => {
            expect(e).toBeInstanceOf(BeanstalkError);
          });
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.DRAINING,
            headers: ['100500'],
          })
        );
        await c
          .put('test')
          .then(() => {
            throw new Error('not thrown');
          })
          .catch((e) => {
            expect(e).toBeInstanceOf(BeanstalkError);
          });
      });
    });

    describe('reserve', () => {
      it("should return job id and it's payload", async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.RESERVED,
            headers: ['100500'],
            data: 'hey there',
          })
        );

        expect(await c.reserve()).toStrictEqual({ id: 100500, payload: 'hey there' });
      });

      it('should return null in case no job available', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.TIMED_OUT,
            headers: [],
          })
        );

        expect(await c.reserve()).toBe(null);
      });

      it('should throw in case DEADLINE_SOON received', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.DEADLINE_SOON,
            headers: [],
          })
        );
        await c
          .reserve()
          .then(() => {
            throw new Error('not thrown');
          })
          .catch((e) => {
            expect(e).toBeInstanceOf(BeanstalkError);
          });
      });
    });

    describe('reserveWithTimeout', () => {
      it('should validate timeout', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.RESERVED,
            headers: ['100500'],
            data: 'hey there',
          })
        );

        await c.reserveWithTimeout(123);

        expect(validateTimeout).toHaveBeenCalledTimes(1);
        expect(validateTimeout).toHaveBeenCalledWith(123);
      });

      it("should return job id and it's payload", async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.RESERVED,
            headers: ['100500'],
            data: 'hey there',
          })
        );

        expect(await c.reserveWithTimeout(123)).toStrictEqual({
          id: 100500,
          payload: 'hey there',
        });
      });

      it('should return null in case no job available', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.TIMED_OUT,
            headers: [],
          })
        );

        expect(await c.reserveWithTimeout(123)).toBe(null);
      });

      it('should throw in case DEADLINE_SOON received', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.DEADLINE_SOON,
            headers: [],
          })
        );

        await c
          .reserveWithTimeout(123)
          .then(() => {
            throw new Error('not thrown');
          })
          .catch((e) => {
            expect(e).toBeInstanceOf(BeanstalkError);
          });
      });
    });

    describe('reserveJob', () => {
      it('should validate job id', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.RESERVED,
            headers: ['100500'],
            data: 'hey there',
          })
        );

        await c.reserveJob(123);

        expect(validateJobId).toHaveBeenCalledTimes(1);
        expect(validateJobId).toHaveBeenCalledWith(123);
      });

      it("should return job id and it's payload", async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.RESERVED,
            headers: ['123'],
            data: 'hey there',
          })
        );

        expect(await c.reserveJob(123)).toStrictEqual({
          id: 123,
          payload: 'hey there',
        });
      });

      it('should return null in case no job with such id found', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: [],
          })
        );

        expect(await c.reserveJob(123)).toBe(null);
      });
    });

    describe('delete', () => {
      it('should validate job id', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.RESERVED,
            headers: ['100500'],
            data: 'hey there',
          })
        );

        await c.delete(123);

        expect(validateJobId).toHaveBeenCalledTimes(1);
        expect(validateJobId).toHaveBeenCalledWith(123);
      });

      it('should return boolean representing delete result', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.DELETED,
            headers: [],
          })
        );

        expect(await c.delete(123)).toBe(true);

        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: [],
          })
        );

        expect(await c.delete(123)).toBe(false);
      });
    });

    describe('release', () => {
      it('should validate jobId, priority and delay', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.INSERTED,
            headers: ['100500'],
          })
        );

        await c.release(123, 1, 2);

        expect(validateJobId).toHaveBeenCalledTimes(1);
        expect(validateJobId).toHaveBeenCalledWith(123);
        expect(validatePriority).toHaveBeenCalledTimes(1);
        expect(validatePriority).toHaveBeenCalledWith(1);
        expect(validateDelay).toHaveBeenCalledTimes(1);
        expect(validateDelay).toHaveBeenCalledWith(2);
      });

      it('should return status of released job', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.RELEASED,
            headers: [],
          })
        );

        expect(await c.release(123, 0, 0)).toBe(BeanstalkJobState.ready);

        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.BURIED,
            headers: [],
          })
        );

        expect(await c.release(123)).toBe(BeanstalkJobState.buried);

        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.RELEASED,
            headers: [],
          })
        );

        expect(await c.release(123, 0, 123)).toBe(BeanstalkJobState.delayed);
      });

      it('should return null in case job not found', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: [],
          })
        );

        expect(await c.release(123)).toBe(null);
      });
    });

    describe('bury', () => {
      it('should validate jobId and priority', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.BURIED,
            headers: ['100500'],
          })
        );

        await c.bury(123, 12);

        expect(validateJobId).toHaveBeenCalledTimes(1);
        expect(validateJobId).toHaveBeenCalledWith(123);
        expect(validatePriority).toHaveBeenCalledTimes(1);
        expect(validatePriority).toHaveBeenCalledWith(12);
      });

      it('should return boolean representing bury result', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.BURIED,
            headers: [],
          })
        );

        expect(await c.bury(123)).toBe(true);

        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: [],
          })
        );

        expect(await c.bury(123)).toBe(false);
      });
    });

    describe('touch', () => {
      it('should validate jobId and priority', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.TOUCHED,
            headers: ['100500'],
          })
        );

        await c.touch(123);

        expect(validateJobId).toHaveBeenCalledTimes(1);
        expect(validateJobId).toHaveBeenCalledWith(123);
      });

      it('should return boolean representing bury result', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.TOUCHED,
            headers: [],
          })
        );

        expect(await c.touch(123)).toBe(true);

        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: [],
          })
        );

        expect(await c.touch(123)).toBe(false);
      });
    });

    describe('use', () => {
      it('should validate tube name', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.USING,
            headers: ['tube-name'],
          })
        );

        await c.use('tube-name');

        expect(validateTubeName).toHaveBeenCalledTimes(1);
        expect(validateTubeName).toHaveBeenCalledWith('tube-name');
      });

      it('should return currently usied tube name', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.USING,
            headers: ['awesome-tube'],
          })
        );

        expect(await c.use('testTube')).toBe('awesome-tube');
      });
    });

    describe('watch', () => {
      it('should validate tube name', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.WATCHING,
            headers: ['tube-name'],
          })
        );

        await c.watch('tube-name');

        expect(validateTubeName).toHaveBeenCalledTimes(1);
        expect(validateTubeName).toHaveBeenCalledWith('tube-name');
      });

      it('should return amount of tubes watched', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.WATCHING,
            headers: ['123'],
          })
        );

        expect(await c.watch('testTube')).toBe(123);
      });
    });

    describe('ignore', () => {
      it('should validate tube name', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.WATCHING,
            headers: ['tube-name'],
          })
        );

        await c.ignore('tube-name');

        expect(validateTubeName).toHaveBeenCalledTimes(1);
        expect(validateTubeName).toHaveBeenCalledWith('tube-name');
      });

      it('should return ignore result of tubes watched', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.WATCHING,
            headers: ['123'],
          })
        );
        expect(await c.ignore('testTube')).toBe(true);

        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_IGNORED,
            headers: ['123'],
          })
        );
        expect(await c.ignore('testTube')).toBe(false);
      });
    });

    describe('peek', () => {
      it('should validate job id', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.FOUND,
            headers: ['100500'],
            data: 'some job payload',
          })
        );

        await c.peek(100500);

        expect(validateJobId).toHaveBeenCalledTimes(1);
        expect(validateJobId).toHaveBeenCalledWith(100500);
      });

      it('should return job id and payload', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.FOUND,
            headers: ['100500'],
            data: 'some job payload',
          })
        );
        expect(await c.peek(100500)).toStrictEqual({
          id: 100500,
          payload: 'some job payload',
        });
      });

      it('should return null in case job not found', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: [],
          })
        );
        expect(await c.peek(100500)).toBe(null);
      });
    });

    describe('peekReady', () => {
      it('should return job id and payload', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.FOUND,
            headers: ['100500'],
            data: 'some job payload',
          })
        );
        expect(await c.peekReady()).toStrictEqual({
          id: 100500,
          payload: 'some job payload',
        });
      });

      it('should return null in case job not found', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: [],
          })
        );
        expect(await c.peekReady()).toBe(null);
      });
    });

    describe('peekDelayed', () => {
      it('should return job id and payload', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.FOUND,
            headers: ['100500'],
            data: 'some job payload',
          })
        );
        expect(await c.peekDelayed()).toStrictEqual({
          id: 100500,
          payload: 'some job payload',
        });
      });

      it('should return null in case job not found', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: [],
          })
        );
        expect(await c.peekDelayed()).toBe(null);
      });
    });

    describe('peekBuried', () => {
      it('should return job id and payload', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.FOUND,
            headers: ['100500'],
            data: 'some job payload',
          })
        );
        expect(await c.peekBuried()).toStrictEqual({
          id: 100500,
          payload: 'some job payload',
        });
      });

      it('should return null in case job not found', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: [],
          })
        );
        expect(await c.peekBuried()).toBe(null);
      });
    });

    describe('kick', () => {
      it('should return amount of kicked jobs', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.KICKED,
            headers: ['100500'],
          })
        );
        expect(await c.kick(50)).toBe(100500);
      });
    });

    describe('kickJob', () => {
      it('should validate job id', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.KICKED,
            headers: ['100500'],
            data: 'some job payload',
          })
        );

        await c.kickJob(100500);

        expect(validateJobId).toHaveBeenCalledTimes(1);
        expect(validateJobId).toHaveBeenCalledWith(100500);
      });

      it('should return boolean representing kick result', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.KICKED,
            headers: ['100500'],
          })
        );
        expect(await c.kickJob(100500)).toBe(true);

        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: ['100500'],
          })
        );
        expect(await c.kickJob(100500)).toBe(false);
      });
    });

    describe('stats', () => {
      it('should return provided data', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.OK,
            headers: ['100500'],
            data: 'this is some data',
          })
        );
        expect(await c.stats()).toBe('this is some data');
      });
    });

    describe('statsTube', () => {
      it('should validate job id', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.OK,
            headers: ['100500'],
            data: 'some job payload',
          })
        );

        await c.statsTube('tube');

        expect(validateTubeName).toHaveBeenCalledTimes(1);
        expect(validateTubeName).toHaveBeenCalledWith('tube');
      });

      it('should return provided data', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.OK,
            headers: ['100500'],
            data: 'this is some data',
          })
        );
        expect(await c.statsTube('test-tube')).toBe('this is some data');
      });

      it('should return null in case tube not found', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: [],
          })
        );
        expect(await c.statsTube('test-tube')).toBe(null);
      });
    });

    describe('statsJob', () => {
      it('should validate job id', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.OK,
            headers: ['100500'],
            data: 'some job payload',
          })
        );

        await c.statsJob(12345);

        expect(validateJobId).toHaveBeenCalledTimes(1);
        expect(validateJobId).toHaveBeenCalledWith(12345);
      });

      it('should return provided data', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.OK,
            headers: ['100500'],
            data: 'this is some data',
          })
        );
        expect(await c.statsJob(12345)).toBe('this is some data');
      });

      it('should return null in case job not found', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: [],
          })
        );
        expect(await c.statsJob(12345)).toBe(null);
      });
    });

    describe('listTubes', () => {
      it('should return provided list', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.OK,
            headers: [],
            data: ['this', 'is', 'tubes', 'list'],
          })
        );
        expect(await c.listTubes()).toStrictEqual(['this', 'is', 'tubes', 'list']);
      });
    });

    describe('listTubesWatched', () => {
      it('should return provided list', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.OK,
            headers: [],
            data: ['this', 'is', 'tubes', 'list'],
          })
        );
        expect(await c.listTubesWatched()).toStrictEqual(['this', 'is', 'tubes', 'list']);
      });
    });

    describe('listTubeUsed', () => {
      it('should return provided list', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.USING,
            headers: ['some-tube'],
          })
        );
        expect(await c.listTubeUsed()).toBe('some-tube');
      });
    });

    describe('pauseTube', () => {
      it('should validate tube name and delay', async () => {
        dispatchCommandMock.mockReturnValue(
          Promise.resolve({
            status: BeanstalkResponseStatus.PAUSED,
            headers: [],
          })
        );

        await c.pauseTube('tube', 123);

        expect(validateTubeName).toHaveBeenCalledTimes(1);
        expect(validateTubeName).toHaveBeenCalledWith('tube');
        expect(validateDelay).toHaveBeenCalledTimes(1);
        expect(validateDelay).toHaveBeenCalledWith(123);
      });

      it('should return boolean representing success of tube pause', async () => {
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.PAUSED,
            headers: [],
          })
        );
        expect(await c.pauseTube('tube', 123)).toBe(true);
        dispatchCommandMock.mockReturnValueOnce(
          Promise.resolve({
            status: BeanstalkResponseStatus.NOT_FOUND,
            headers: [],
          })
        );
        expect(await c.pauseTube('tube', 123)).toBe(false);
      });
    });
  });

  it('should perform async commands one by one, and not stuck with rejected', async () => {
    const conn = new ConnectionMock();
    conn.getState.mockReturnValue('open');

    const serializer = new JsonSerializer();
    const c = new Client(
      {
        serializer,
        defaultTTR: 5,
        defaultPriority: 6,
        defaultDelay: 7,
      },
      conn
    );

    // @ts-expect-error we're mocking private method so obviously TS is unhappy.
    const readCommandResponseMock = jest.spyOn(c, 'readCommandResponse') as SpyInstance<
      ReturnType<Client['readCommandResponse']>,
      Parameters<Client['readCommandResponse']>
    >;

    let call = 5;
    readCommandResponseMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              status: BeanstalkResponseStatus.BURIED,
              headers: ['100500'],
            });
          }, 100 - call-- * 15);
        })
    );

    // in this test, dispatchCommandMock implemented the way that first command waits the most so in
    // case unordered execution it should occur in list the last
    let resolveOrder: number[] = [];

    await Promise.allSettled([
      c.bury(10).then(() => {
        resolveOrder.push(10);
      }),
      c.bury(20).then(() => {
        resolveOrder.push(20);
      }),
      c.bury(30).then(() => {
        resolveOrder.push(30);
      }),
      c.bury(40).then(() => {
        resolveOrder.push(40);
      }),
      c.bury(50).then(() => {
        resolveOrder.push(50);
      }),
    ]);

    expect(resolveOrder).toStrictEqual([10, 20, 30, 40, 50]);

    // here were rejecting promise in the middle, it should not affect the queue advancing
    call = 5;
    readCommandResponseMock.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          const idx = call--;

          setTimeout(() => {
            if (idx === 3) {
              reject(new Error('some error'));
              return;
            }

            resolve({
              status: BeanstalkResponseStatus.BURIED,
              headers: ['100500'],
            });
          }, 100 - idx * 15);
        })
    );

    resolveOrder = [];

    await Promise.allSettled([
      c.bury(10).then(() => {
        resolveOrder.push(10);
      }),
      c.bury(20).then(() => {
        resolveOrder.push(20);
      }),
      c
        .bury(30)
        .then(() => {
          resolveOrder.push(30);
        })
        .catch(() => {}),
      c.bury(40).then(() => {
        resolveOrder.push(40);
      }),
      c.bury(50).then(() => {
        resolveOrder.push(50);
      }),
    ]);

    expect(resolveOrder).toStrictEqual([10, 20, 40, 50]);
  });
});
