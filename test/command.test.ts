import {describe, expect, it} from 'vite-plus/test';
import {Buffer} from 'node:buffer';
import {dump} from 'js-yaml';
import {Command} from '../src/command.js';
import {CommandName, ResponseStatus} from '../src/types.js';
import {CommandError, CommandErrorCode} from '../src/error/command-error.js';
import {JsonSerializer} from '../src/serializer/json-serializer.js';

describe('Command', () => {
	it('should be defined', () => {
		expect(Command).toBeDefined();
	});

	describe('construct', () => {
		it('should be constructable via new', () => {
			expect(new Command(CommandName.bury)).toBeInstanceOf(Command);
		});

		it('should throw on unknown command', () => {
			// @ts-expect-error testing incompatible command
			const construct = () => new Command('totally unknown command');

			expect(construct).toThrow(CommandError);
			expect(construct).toThrow(expect.objectContaining({code: CommandErrorCode.ErrCommandUnknown}));
		});

		it('should throw if unknown status expected', () => {
			const construct = () =>
				new Command(CommandName.bury, {
					// @ts-expect-error testing incompatible status
					expectedStatus: ['totally unknown status'],
				});

			expect(construct).toThrow(CommandError);
			expect(construct).toThrow(expect.objectContaining({code: CommandErrorCode.ErrResponseStatusUnknown}));
		});
	});

	describe('buildCommandBuffer', () => {
		const cmd = new Command(CommandName.bury);

		const tableTests: Array<{
			name: string;
			in: Parameters<Command['buildCommandBuffer']>;
			out: ReturnType<Command['buildCommandBuffer']>;
		}> = [
			{
				name: 'no args',
				in: [],
				out: Buffer.from('bury\r\n'),
			},
			{
				name: 'multiple args',
				in: [['arg1', 'arg2']],
				out: Buffer.from('bury arg1 arg2\r\n'),
			},
			{
				name: 'payload only',
				in: [[], Buffer.from('some payload')],
				out: Buffer.from('bury 12\r\nsome payload\r\n'),
			},
			{
				name: 'payload with args',
				in: [['arg1', 'arg2'], Buffer.from('some payload')],
				out: Buffer.from('bury arg1 arg2 12\r\nsome payload\r\n'),
			},
		];

		it.each(tableTests)('$name', (test) => {
			expect(cmd.buildCommandBuffer(...test.in)).toStrictEqual(test.out);
		});
	});

	describe('handleResponse', () => {
		it('should throw in case of error response', () => {
			const cmd = new Command(CommandName.bury);

			const throwing = () => cmd.handleResponse({status: ResponseStatus.UNKNOWN_COMMAND, headers: []});

			expect(throwing).toThrow(CommandError);
			expect(throwing).toThrow(expect.objectContaining({code: CommandErrorCode.ErrErrorResponseStatus}));
		});

		it('should throw in case of unexpected response', () => {
			const cmd = new Command(CommandName.bury);

			const throwing = () => cmd.handleResponse({status: ResponseStatus.OK, headers: []});

			expect(throwing).toThrow(CommandError);
			expect(throwing).toThrow(expect.objectContaining({code: CommandErrorCode.ErrUnexpectedResponseStatus}));
		});

		it('should return status and headers', () => {
			const cmd = new Command(CommandName.bury, {
				expectedStatus: [ResponseStatus.BURIED],
			});

			expect(
				cmd.handleResponse({
					status: ResponseStatus.BURIED,
					headers: ['123'],
				}),
			).toStrictEqual({
				status: ResponseStatus.BURIED,
				headers: ['123'],
			});
		});

		it('should parse json body with given serializer', () => {
			const cmd = new Command(CommandName.bury, {
				expectedStatus: [ResponseStatus.BURIED],
				payloadBody: true,
			});

			expect(
				cmd.handleResponse(
					{
						status: ResponseStatus.BURIED,
						headers: ['123'],
						data: Buffer.from(`${JSON.stringify(['hello', 'world'])}\r\n`),
					},
					new JsonSerializer(),
				),
			).toStrictEqual({
				status: ResponseStatus.BURIED,
				headers: ['123'],
				data: ['hello', 'world'],
			});
		});

		it('should return raw data if no serializer passed or body specification passed', () => {
			const cmd = new Command(CommandName.bury, {
				expectedStatus: [ResponseStatus.BURIED],
				payloadBody: true,
			});

			expect(
				cmd.handleResponse({
					status: ResponseStatus.BURIED,
					headers: ['123'],
					data: Buffer.from(`${JSON.stringify(['hello', 'world'])}\r\n`),
				}),
			).toStrictEqual({
				status: ResponseStatus.BURIED,
				headers: ['123'],
				data: Buffer.from(JSON.stringify(['hello', 'world'])),
			});

			const cmd2 = new Command(CommandName.bury, {
				expectedStatus: [ResponseStatus.BURIED],
			});

			expect(
				cmd2.handleResponse({
					status: ResponseStatus.BURIED,
					headers: ['123'],
					data: Buffer.from(`${JSON.stringify(['hello', 'world'])}\r\n`),
				}),
			).toStrictEqual({
				status: ResponseStatus.BURIED,
				headers: ['123'],
				data: Buffer.from(JSON.stringify(['hello', 'world'])),
			});
		});

		it('should parse yaml body', () => {
			const cmd = new Command(CommandName.bury, {
				expectedStatus: [ResponseStatus.BURIED],
				yamlBody: true,
			});

			expect(
				cmd.handleResponse(
					{
						status: ResponseStatus.BURIED,
						headers: ['123'],
						data: Buffer.from(`${dump(['hello', 'world'])}\r\n`),
					},
					new JsonSerializer(),
				),
			).toStrictEqual({
				status: ResponseStatus.BURIED,
				headers: ['123'],
				data: ['hello', 'world'],
			});
		});
	});
});
