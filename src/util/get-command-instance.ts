import {CommandName, ResponseStatus} from '../types.js';
import {Command, type CommandOptions} from '../command.js';
import {CommandError, CommandErrorCode} from '../error/command-error.js';

const commandConfig = {
	[CommandName.put]: {
		expectedStatus: [
			ResponseStatus.INSERTED,
			ResponseStatus.BURIED,
			ResponseStatus.EXPECTED_CRLF,
			ResponseStatus.JOB_TOO_BIG,
			ResponseStatus.DRAINING,
		],
	},
	[CommandName.use]: {
		expectedStatus: [ResponseStatus.USING],
	},

	[CommandName.reserve]: {
		expectedStatus: [
			ResponseStatus.TIMED_OUT,
			ResponseStatus.DEADLINE_SOON,
			ResponseStatus.RESERVED,
		],
		payloadBody: true,
	},
	[CommandName['reserve-with-timeout']]: {
		expectedStatus: [
			ResponseStatus.TIMED_OUT,
			ResponseStatus.DEADLINE_SOON,
			ResponseStatus.RESERVED,
		],
		payloadBody: true,
	},
	[CommandName['reserve-job']]: {
		expectedStatus: [ResponseStatus.NOT_FOUND, ResponseStatus.RESERVED],
		payloadBody: true,
	},
	[CommandName.delete]: {
		expectedStatus: [ResponseStatus.NOT_FOUND, ResponseStatus.DELETED],
	},
	[CommandName.release]: {
		expectedStatus: [
			ResponseStatus.RELEASED,
			ResponseStatus.BURIED,
			ResponseStatus.NOT_FOUND,
		],
	},
	[CommandName.bury]: {
		expectedStatus: [ResponseStatus.BURIED, ResponseStatus.NOT_FOUND],
	},
	[CommandName.touch]: {
		expectedStatus: [ResponseStatus.TOUCHED, ResponseStatus.NOT_FOUND],
	},

	[CommandName.watch]: {
		expectedStatus: [ResponseStatus.WATCHING],
	},
	[CommandName.ignore]: {
		expectedStatus: [ResponseStatus.WATCHING, ResponseStatus.NOT_IGNORED],
	},

	[CommandName.peek]: {
		expectedStatus: [ResponseStatus.FOUND, ResponseStatus.NOT_FOUND],
		payloadBody: true,
	},
	[CommandName['peek-ready']]: {
		expectedStatus: [ResponseStatus.FOUND, ResponseStatus.NOT_FOUND],
		payloadBody: true,
	},
	[CommandName['peek-buried']]: {
		expectedStatus: [ResponseStatus.FOUND, ResponseStatus.NOT_FOUND],
		payloadBody: true,
	},
	[CommandName['peek-delayed']]: {
		expectedStatus: [ResponseStatus.FOUND, ResponseStatus.NOT_FOUND],
		payloadBody: true,
	},

	[CommandName.kick]: {
		expectedStatus: [ResponseStatus.KICKED],
	},
	[CommandName['kick-job']]: {
		expectedStatus: [ResponseStatus.KICKED, ResponseStatus.NOT_FOUND],
	},

	[CommandName.stats]: {
		expectedStatus: [ResponseStatus.OK],
		yamlBody: true,
	},
	[CommandName['stats-job']]: {
		expectedStatus: [ResponseStatus.OK, ResponseStatus.NOT_FOUND],
		yamlBody: true,
	},
	[CommandName['stats-tube']]: {
		expectedStatus: [ResponseStatus.OK, ResponseStatus.NOT_FOUND],
		yamlBody: true,
	},

	[CommandName['list-tubes']]: {
		expectedStatus: [ResponseStatus.OK],
		yamlBody: true,
	},
	[CommandName['list-tube-used']]: {
		expectedStatus: [ResponseStatus.USING],
	},
	[CommandName['list-tubes-watched']]: {
		yamlBody: true,
		expectedStatus: [ResponseStatus.OK],
	},

	[CommandName['pause-tube']]: {
		expectedStatus: [ResponseStatus.PAUSED, ResponseStatus.NOT_FOUND],
	},

	[CommandName.quit]: {
		expectedStatus: [],
	},
} as const;
type CommandConfig = typeof commandConfig;

const commandInstances: Partial<
	Record<CommandName, Command<CommandConfig[CommandName]['expectedStatus'][number]>>
> = {};

export function getCommandInstance<Cmd extends CommandName>(
	cmd: Cmd,
): Command<CommandConfig[Cmd]['expectedStatus'][number]> {
	let command = commandInstances[cmd] as Command<CommandConfig[Cmd]['expectedStatus'][number]> | undefined;
	if (command) return command;

	const cfg = commandConfig[cmd] as CommandOptions<CommandConfig[Cmd]['expectedStatus'][number]> | undefined;
	if (!cfg) {
		throw new CommandError(CommandErrorCode.ErrCommandUnknown, `Unknown beanstalk command '${cmd}'`);
	}

	command = new Command(cmd, cfg);
	commandInstances[cmd] = command;

	return command;
}
