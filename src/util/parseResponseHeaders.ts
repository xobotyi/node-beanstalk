import {BeanstalkDataResponseStatus, type BeanstalkResponseStatus, type ICommandResponseHeaders} from '../types.js';
import {CRLF_BUFF} from '../const.js';
import {ResponseError, ResponseErrorCode} from '../error/ResponseError.js';

export function parseResponseHeaders(buff: Buffer): ICommandResponseHeaders | null {
	const firstCrlf = buff.indexOf(CRLF_BUFF);

	if (firstCrlf === -1) return null;

	const [status, ...restHeaders] = buff.slice(0, firstCrlf).toString().split(' ') as [
		BeanstalkResponseStatus,
		...string[],
	];

	const hasData = status in BeanstalkDataResponseStatus;
	let dataLength = 0;
	const headers = restHeaders;

	if (hasData) {
		const lengthHeader = headers.pop();
		dataLength = Number.parseInt(lengthHeader as string, 10);

		if (Number.isNaN(dataLength)) {
			throw new ResponseError(
				ResponseErrorCode.ErrInvalidBodyLength,
				`Received invalid data length for ${status} response, expected number, got ${lengthHeader}`,
			);
		}
	}

	return {
		headersLineLen: firstCrlf + CRLF_BUFF.length,
		status,
		headers,
		hasData,
		dataLength: dataLength && dataLength + CRLF_BUFF.length,
	};
}
