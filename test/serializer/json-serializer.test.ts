import {describe, expect, it} from 'vite-plus/test';
import {JsonSerializer} from '../../src/serializer/json-serializer.js';
import {SerializerError} from '../../src/index.js';
import {SerializerErrorCode} from '../../src/error/serializer-error.js';

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

		const obj: any = {};
		obj.a = obj;

		it('should throw on encode error', () => {
			const throwing = () => s.serialize(obj);

			expect(throwing).toThrow(SerializerError);
			expect(throwing).toThrow(expect.objectContaining({code: SerializerErrorCode.ErrSerializeError}));
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

		it('should throw on decode error', () => {
			const throwing = () => s.deserialize(Buffer.from('{"invalid json'));

			expect(throwing).toThrow(SerializerError);
			expect(throwing).toThrow(expect.objectContaining({code: SerializerErrorCode.ErrDeserializeError}));
		});
	});
});
