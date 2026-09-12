import {describe, expect, it} from 'vite-plus/test';
import {Buffer} from 'node:buffer';
import {parseResponseHeaders} from '../../src/util/parse-response-headers.js';
import {BeanstalkResponseStatus, type ICommandResponseHeaders} from '../../src/types.js';
import {CRLF_BUFF} from '../../src/const.js';
import {ResponseErrorCode} from '../../src/error/response-error.js';

describe('parseResponseHeaders', () => {
	it('should be defined', () => {
		expect(parseResponseHeaders).toBeDefined();
		expect(parseResponseHeaders).toBeInstanceOf(Function);
	});

	const tableTests: Array<{name: string; in: Buffer; out: ICommandResponseHeaders | null}> = [
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
			},
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
			},
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
			},
		},
	];

	it.each(tableTests)('$name', (test) => {
		expect(parseResponseHeaders(test.in)).toStrictEqual(test.out);
	});

	it('should throw in case data length is malformed', () => {
		const throwing = () => parseResponseHeaders(Buffer.from('OK heY!\r\n'));

		expect(throwing).toThrow(expect.objectContaining({code: ResponseErrorCode.ErrInvalidBodyLength}));
	});

	it('should throw in case data length has trailing garbage', () => {
		expect(() => parseResponseHeaders(Buffer.from('OK 100abc\r\n'))).toThrow(
			expect.objectContaining({code: ResponseErrorCode.ErrInvalidBodyLength}),
		);
	});

	it('should accept the largest data length whose sum with CRLF is a safe integer', () => {
		const headersLine = `OK ${Number.MAX_SAFE_INTEGER - CRLF_BUFF.length}`;

		expect(parseResponseHeaders(Buffer.from(`${headersLine}\r\n`))).toStrictEqual({
			status: BeanstalkResponseStatus.OK,
			headers: [],
			hasData: true,
			dataLength: Number.MAX_SAFE_INTEGER,
			headersLineLen: headersLine.length + CRLF_BUFF.length,
		});
	});

	it('should throw in case data length plus CRLF is not a safe integer', () => {
		expect(() => parseResponseHeaders(Buffer.from(`OK ${Number.MAX_SAFE_INTEGER}\r\n`))).toThrow(
			expect.objectContaining({code: ResponseErrorCode.ErrInvalidBodyLength}),
		);
	});

	it('should throw in case data length is empty', () => {
		expect(() => parseResponseHeaders(Buffer.from('OK \r\n'))).toThrow(
			expect.objectContaining({code: ResponseErrorCode.ErrInvalidBodyLength}),
		);
	});
});
