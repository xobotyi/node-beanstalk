import {describe, expect, it} from 'vite-plus/test';
import {runInNewContext} from 'node:vm';
import {JsonSerializer} from '../../src/serializer/json-serializer.js';
import {SerializerError} from '../../src/index.js';
import {SerializerErrorCode} from '../../src/error/serializer-error.js';

function thrownMessage(fn: () => unknown): string {
	try {
		fn();
	} catch (error) {
		return error instanceof Error ? error.message : String(error);
	}

	throw new Error('expected the callback to throw');
}

describe('JsonSerializer', () => {
	it('should be defined', () => {
		expect(JsonSerializer).toBeDefined();
	});

	it('should be constructable via new', () => {
		expect(new JsonSerializer()).toBeInstanceOf(JsonSerializer);
	});

	it('should have serialize and deserialize methods', () => {
		const s = new JsonSerializer();
		expect(typeof s.serialize).toBe('function');
		expect(typeof s.deserialize).toBe('function');
	});

	describe('JsonSerializer.serialize', () => {
		const tableTests = [
			{
				name: 'string',
				in: 'node-beanstalk',
				out: Buffer.from(JSON.stringify('node-beanstalk')),
			},
			{
				name: 'array',
				in: ['a', 'b', 1, 2],
				out: Buffer.from(JSON.stringify(['a', 'b', 1, 2])),
			},
			{
				name: 'object',
				in: {foo: 'bar', baz: 123},
				out: Buffer.from(JSON.stringify({foo: 'bar', baz: 123})),
			},
		];

		const s = new JsonSerializer();

		it.each(tableTests)('$name', (test) => {
			expect(s.serialize(test.in)).toStrictEqual(test.out);
		});

		const obj: {a?: unknown} = {};
		obj.a = obj;

		it('should throw on encode error', () => {
			const throwing = () => s.serialize(obj);

			expect(throwing).toThrow(SerializerError);
			expect(throwing).toThrow(expect.objectContaining({code: SerializerErrorCode.ErrSerializeError}));
		});

		it('should carry a non-Error throw from toJSON as the message', () => {
			const throwing = () =>
				s.serialize({
					toJSON() {
						// oxlint-disable-next-line typescript/only-throw-error, eslint/no-throw-literal -- exercises the non-Error branch of errorMessage
						throw 'boom';
					},
				});

			expect(throwing).toThrow(expect.objectContaining({code: SerializerErrorCode.ErrSerializeError, message: 'boom'}));
		});

		it('should carry the message of an Error thrown from another realm', () => {
			const throwing = () =>
				s.serialize({
					toJSON() {
						// oxlint-disable-next-line typescript/only-throw-error -- the realm's Error is not this realm's Error class
						throw runInNewContext("new Error('boom from another realm')");
					},
				});

			expect(throwing).toThrow(
				expect.objectContaining({code: SerializerErrorCode.ErrSerializeError, message: 'boom from another realm'}),
			);
		});

		it('should use a fixed message for a non-string, non-Error throw from toJSON', () => {
			const throwing = () =>
				s.serialize({
					toJSON() {
						// oxlint-disable-next-line typescript/only-throw-error, eslint/no-throw-literal -- exercises the fallback branch of errorMessage
						throw 42;
					},
				});

			expect(throwing).toThrow(
				expect.objectContaining({code: SerializerErrorCode.ErrSerializeError, message: 'non-Error value thrown'}),
			);
		});
	});

	describe('JsonSerializer.deserialize', () => {
		const tableTests = [
			{
				name: 'string',
				in: Buffer.from(JSON.stringify('node-beanstalk')),
				out: 'node-beanstalk',
			},
			{
				name: 'array',
				in: Buffer.from(JSON.stringify(['a', 'b', 1, 2])),
				out: ['a', 'b', 1, 2],
			},
			{
				name: 'object',
				in: Buffer.from(JSON.stringify({foo: 'bar', baz: 123})),
				out: {foo: 'bar', baz: 123},
			},
		];

		const s = new JsonSerializer();

		it.each(tableTests)('$name', (test) => {
			expect(s.deserialize(test.in)).toStrictEqual(test.out);
		});

		it('should throw on decode error carrying the bare parse message', () => {
			const throwing = () => {
				s.deserialize(Buffer.from('{"invalid json'));
			};

			expect(throwing).toThrow(SerializerError);
			expect(throwing).toThrow(
				expect.objectContaining({
					code: SerializerErrorCode.ErrDeserializeError,
					message: thrownMessage(() => JSON.parse('{"invalid json')),
				}),
			);
		});
	});
});
