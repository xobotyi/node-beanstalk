import {describe, expect, it} from 'vite-plus/test';
import {getCommandInstance} from '../../src/util/getCommandInstance.js';
import {CommandError, CommandErrorCode} from '../../src/error/CommandError.js';
import {BeanstalkCommand} from '../../src/types.js';

describe('getCommandInstance', () => {
	it('should be defined', () => {
		expect(getCommandInstance).toBeDefined();
	});

	it('should throw in case of unknown command', () => {
		try {
			// @ts-expect-error testing unknown command
			getCommandInstance('DEFINITELY_UNKNOWN_COMMAND');
			throw new Error('not thrown!');
		} catch (e: any) {
			expect(e).toBeInstanceOf(CommandError);
			expect(e.code).toBe(CommandErrorCode.ErrCommandUnknown);
		}
	});

	it('should always return single instance for certain command', () => {
		const cmd = getCommandInstance(BeanstalkCommand.bury);

		expect(getCommandInstance(BeanstalkCommand.bury)).toBe(cmd);
		expect(getCommandInstance(BeanstalkCommand.bury)).toBe(cmd);
		expect(getCommandInstance(BeanstalkCommand.bury)).toBe(cmd);
	});
});
