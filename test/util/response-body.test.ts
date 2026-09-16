import {describe, expect, it} from 'vite-plus/test';
import {requireMapBody, requireStringListBody} from '../../src/util/response-body.js';
import {CommandName} from '../../src/types.js';
import {ResponseErrorCode} from '../../src/error/response-error.js';

describe('requireMapBody', () => {
	it('should return the map the response carries', () => {
		expect(requireMapBody({pid: 100_500, version: '1.13'}, CommandName.stats)).toStrictEqual({
			pid: 100_500,
			version: '1.13',
		});
	});

	const rejectedBodies: Array<{name: string; body: unknown}> = [
		{name: 'a string', body: 'some text'},
		{name: 'a list', body: ['default']},
		{name: 'null', body: null},
		{name: 'a number', body: 42},
		{name: 'undefined', body: undefined},
	];

	it.each(rejectedBodies)('should throw in case the body is $name', ({body}) => {
		expect(() => requireMapBody(body, CommandName.stats)).toThrow(
			expect.objectContaining({code: ResponseErrorCode.ErrUnexpectedBody}),
		);
	});
});

describe('requireStringListBody', () => {
	it('should return the list the response carries', () => {
		expect(requireStringListBody(['default', 'other'], CommandName['list-tubes'])).toStrictEqual(['default', 'other']);
	});

	it('should return an empty list', () => {
		expect(requireStringListBody([], CommandName['list-tubes'])).toStrictEqual([]);
	});

	const rejectedBodies: Array<{name: string; body: unknown}> = [
		{name: 'a map', body: {tube: 'default'}},
		{name: 'a string', body: 'default'},
		{name: 'a list carrying a number', body: ['default', 1]},
		{name: 'null', body: null},
	];

	it.each(rejectedBodies)('should throw in case the body is $name', ({body}) => {
		expect(() => requireStringListBody(body, CommandName['list-tubes'])).toThrow(
			expect.objectContaining({code: ResponseErrorCode.ErrUnexpectedBody}),
		);
	});
});
