import {describe, expect, it} from 'vite-plus/test';
import {getCommandInstance} from '../../src/util/get-command-instance.js';
import {CommandError, CommandErrorCode} from '../../src/error/command-error.js';
import {BeanstalkCommand} from '../../src/types.js';

describe('getCommandInstance', () => {
	it('should be defined', () => {
		expect(getCommandInstance).toBeDefined();
	});

	it('should throw in case of unknown command', () => {
		// @ts-expect-error testing unknown command
		const throwing = () => getCommandInstance('DEFINITELY_UNKNOWN_COMMAND');

		expect(throwing).toThrow(CommandError);
		expect(throwing).toThrow(expect.objectContaining({code: CommandErrorCode.ErrCommandUnknown}));
	});

	it('should always return single instance for certain command', () => {
		const cmd = getCommandInstance(BeanstalkCommand.bury);

		expect(getCommandInstance(BeanstalkCommand.bury)).toBe(cmd);
		expect(getCommandInstance(BeanstalkCommand.bury)).toBe(cmd);
		expect(getCommandInstance(BeanstalkCommand.bury)).toBe(cmd);
	});
});
