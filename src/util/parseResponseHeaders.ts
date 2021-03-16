import {
  BeanstalkDataResponseStatus,
  BeanstalkResponseStatus,
  ICommandResponseHeaders,
} from '../types';
import { CRLF_BUFF } from '../const';

export function parseResponseHeaders(buff: Buffer): ICommandResponseHeaders | null {
  const firstCrlf = buff.indexOf(CRLF_BUFF);

  if (firstCrlf === -1) return null;

  const [status, ...restHeaders] = buff.slice(0, firstCrlf).toString().split(' ') as [
    BeanstalkResponseStatus,
    ...string[]
  ];
  const hasData = status in BeanstalkDataResponseStatus;
  let dataLength = 0;
  const headers = restHeaders;

  if (hasData) {
    dataLength = parseInt(headers.pop() as string, 10) ?? 0;
  }

  return {
    headersLineLen: firstCrlf + CRLF_BUFF.length,
    status,
    headers,
    hasData,
    dataLength: dataLength && dataLength + CRLF_BUFF.length,
  };
}
