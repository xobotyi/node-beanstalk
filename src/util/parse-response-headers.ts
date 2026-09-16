import {DataResponseStatus, type ResponseStatus, type CommandResponseHeaders} from '../types.js';
import {CRLF_BUFF} from '../const.js';
import {ResponseError, ResponseErrorCode} from '../error/response-error.js';

/**
 * Parses an unsigned decimal header token into a safe integer no greater than `max`. Any other input, the empty token
 * included, throws a ResponseError carrying `code`.
 */
export function parseNumericHeader(
	header: string | undefined,
	code: ResponseErrorCode = ResponseErrorCode.ErrInvalidNumericHeader,
	max = Number.MAX_SAFE_INTEGER,
): number {
	const value = Number(header);

	if (header === undefined || !/^\d+$/.test(header) || !Number.isSafeInteger(value) || value > max) {
		throw new ResponseError(code, `Expected an unsigned integer header of at most ${max}, got '${header}'`);
	}

	return value;
}

/**
 * Reads the header token at {index}. A response that carries none throws a ResponseError of code `ErrMissingHeader`.
 */
export function requireHeader(headers: string[], index: number): string {
	const header = headers[index];

	if (header === undefined) {
		throw new ResponseError(
			ResponseErrorCode.ErrMissingHeader,
			`Expected a header at position ${index}, response carries ${headers.length}`,
		);
	}

	return header;
}

// constraint: the read loop compares the body length plus the CRLF against buffer sizes, so their sum must stay exact
const MAX_DATA_LENGTH = Number.MAX_SAFE_INTEGER - CRLF_BUFF.length;

export function parseResponseHeaders(buff: Buffer): CommandResponseHeaders | null {
	const firstCrlf = buff.indexOf(CRLF_BUFF);

	if (firstCrlf === -1) return null;

	const [status, ...restHeaders] = buff.subarray(0, firstCrlf).toString().split(' ') as [ResponseStatus, ...string[]];

	const hasData = status in DataResponseStatus;
	let dataLength = 0;
	const headers = restHeaders;

	if (hasData) {
		dataLength = parseNumericHeader(headers.pop(), ResponseErrorCode.ErrInvalidBodyLength, MAX_DATA_LENGTH);
	}

	return {
		headersLineLen: firstCrlf + CRLF_BUFF.length,
		status,
		headers,
		hasData,
		dataLength: hasData ? dataLength + CRLF_BUFF.length : 0,
	};
}
