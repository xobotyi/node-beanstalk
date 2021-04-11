import { Buffer } from 'buffer';
import { parseResponseHeaders } from '../../src/util/parseResponseHeaders';
import { BeanstalkResponseStatus, ICommandResponseHeaders } from '../../src/types';
import { ResponseError, ResponseErrorCode } from '../../src/error/ResponseError';

describe('parseResponseHeaders', () => {
  it('should be defined', () => {
    expect(parseResponseHeaders).toBeDefined();
    expect(parseResponseHeaders).toBeInstanceOf(Function);
  });

  const tableTests = [
    {
      name: 'null in case no LF',
      in: Buffer.from('OK 1234'),
      out: null,
    },
    {
      name: 'response with no headers',
      in: Buffer.from('BURIED\r\n'),
      out: {
        status: BeanstalkResponseStatus.BURIED,
        headers: [],
        hasData: false,
        dataLength: 0,
        headersLineLen: 8,
      } as ICommandResponseHeaders,
    },
    {
      name: 'response with headers',
      in: Buffer.from('WATCHING test-tube\r\n'),
      out: {
        status: BeanstalkResponseStatus.WATCHING,
        headers: ['test-tube'],
        hasData: false,
        dataLength: 0,
        headersLineLen: 20,
      } as ICommandResponseHeaders,
    },
    {
      name: 'data response',
      in: Buffer.from('OK 123\r\n'),
      out: {
        status: BeanstalkResponseStatus.OK,
        headers: [],
        hasData: true,
        dataLength: 125,
        headersLineLen: 8,
      } as ICommandResponseHeaders,
    },
  ];

  // eslint-disable-next-line no-restricted-syntax
  for (const test of tableTests) {
    // eslint-disable-next-line @typescript-eslint/no-loop-func
    it(test.name, () => {
      expect(parseResponseHeaders(test.in)).toStrictEqual(test.out);
    });
  }

  it('should throw in case data length is malformed', () => {
    try {
      parseResponseHeaders(Buffer.from('OK heY!\r\n'));
      throw new Error('not thrown!');
    } catch (e: unknown) {
      expect((e as ResponseError).code).toBe(ResponseErrorCode.ErrInvalidBodyLength);
    }
  });
});
