import { ICommandResponseHeaders } from '../types';
import { CRLF, BeanstalkDataResponseStatus, BeanstalkResponseStatus } from '../const';

export function parseResponseHeaders(str: string): ICommandResponseHeaders | null {
  const firstCrlf = str.indexOf(CRLF);

  if (firstCrlf === -1) return null;

  const [status, ...restHeaders] = str.substr(0, firstCrlf).split(' ') as [
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
    headersLineLen: firstCrlf + CRLF.length,
    status,
    headers,
    hasData,
    dataLength: dataLength && dataLength + CRLF.length,
  };
}
