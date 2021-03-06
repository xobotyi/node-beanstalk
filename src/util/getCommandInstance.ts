import { BeanstalkCommand, BeanstalkResponseStatus } from '../types';
import { Command, ICommandCtorOptions } from '../Command';
import { CommandError, CommandErrorCode } from '../error/CommandError';

const commandConfig = {
  [BeanstalkCommand.put]: {
    expectedStatus: [
      BeanstalkResponseStatus.INSERTED,
      BeanstalkResponseStatus.BURIED,
      BeanstalkResponseStatus.EXPECTED_CRLF,
      BeanstalkResponseStatus.JOB_TOO_BIG,
      BeanstalkResponseStatus.DRAINING,
    ],
  },
  [BeanstalkCommand.use]: {
    expectedStatus: [BeanstalkResponseStatus.USING],
  },

  [BeanstalkCommand.reserve]: {
    expectedStatus: [
      BeanstalkResponseStatus.TIMED_OUT,
      BeanstalkResponseStatus.DEADLINE_SOON,
      BeanstalkResponseStatus.RESERVED,
    ],
    payloadBody: true,
  },
  [BeanstalkCommand['reserve-with-timeout']]: {
    expectedStatus: [
      BeanstalkResponseStatus.TIMED_OUT,
      BeanstalkResponseStatus.DEADLINE_SOON,
      BeanstalkResponseStatus.RESERVED,
    ],
    payloadBody: true,
  },
  [BeanstalkCommand['reserve-job']]: {
    expectedStatus: [BeanstalkResponseStatus.NOT_FOUND, BeanstalkResponseStatus.RESERVED],
    payloadBody: true,
  },
  [BeanstalkCommand.delete]: {
    expectedStatus: [BeanstalkResponseStatus.NOT_FOUND, BeanstalkResponseStatus.DELETED],
  },
  [BeanstalkCommand.release]: {
    expectedStatus: [
      BeanstalkResponseStatus.RELEASED,
      BeanstalkResponseStatus.BURIED,
      BeanstalkResponseStatus.NOT_FOUND,
    ],
  },
  [BeanstalkCommand.bury]: {
    expectedStatus: [BeanstalkResponseStatus.BURIED, BeanstalkResponseStatus.NOT_FOUND],
  },
  [BeanstalkCommand.touch]: {
    expectedStatus: [BeanstalkResponseStatus.TOUCHED, BeanstalkResponseStatus.NOT_FOUND],
  },

  [BeanstalkCommand.watch]: {
    expectedStatus: [BeanstalkResponseStatus.WATCHING],
  },
  [BeanstalkCommand.ignore]: {
    expectedStatus: [BeanstalkResponseStatus.WATCHING, BeanstalkResponseStatus.NOT_IGNORED],
  },

  [BeanstalkCommand.peek]: {
    expectedStatus: [BeanstalkResponseStatus.FOUND, BeanstalkResponseStatus.NOT_FOUND],
    payloadBody: true,
  },
  [BeanstalkCommand['peek-ready']]: {
    expectedStatus: [BeanstalkResponseStatus.FOUND, BeanstalkResponseStatus.NOT_FOUND],
    payloadBody: true,
  },
  [BeanstalkCommand['peek-buried']]: {
    expectedStatus: [BeanstalkResponseStatus.FOUND, BeanstalkResponseStatus.NOT_FOUND],
    payloadBody: true,
  },
  [BeanstalkCommand['peek-delayed']]: {
    expectedStatus: [BeanstalkResponseStatus.FOUND, BeanstalkResponseStatus.NOT_FOUND],
    payloadBody: true,
  },

  [BeanstalkCommand.kick]: {
    expectedStatus: [BeanstalkResponseStatus.KICKED],
  },
  [BeanstalkCommand['kick-job']]: {
    expectedStatus: [BeanstalkResponseStatus.KICKED, BeanstalkResponseStatus.NOT_FOUND],
  },

  [BeanstalkCommand.stats]: {
    expectedStatus: [BeanstalkResponseStatus.OK],
    yamlBody: true,
  },
  [BeanstalkCommand['stats-job']]: {
    expectedStatus: [BeanstalkResponseStatus.OK, BeanstalkResponseStatus.NOT_FOUND],
    yamlBody: true,
  },
  [BeanstalkCommand['stats-tube']]: {
    expectedStatus: [BeanstalkResponseStatus.OK, BeanstalkResponseStatus.NOT_FOUND],
    yamlBody: true,
  },

  [BeanstalkCommand['list-tubes']]: {
    expectedStatus: [BeanstalkResponseStatus.OK],
    yamlBody: true,
  },
  [BeanstalkCommand['list-tube-used']]: {
    expectedStatus: [BeanstalkResponseStatus.USING],
  },
  [BeanstalkCommand['list-tubes-watched']]: {
    yamlBody: true,
    expectedStatus: [BeanstalkResponseStatus.OK],
  },

  [BeanstalkCommand['pause-tube']]: {
    expectedStatus: [BeanstalkResponseStatus.PAUSED, BeanstalkResponseStatus.NOT_FOUND],
  },

  [BeanstalkCommand.quit]: {
    expectedStatus: [],
  },
} as const;
type ICommandConfig = typeof commandConfig;

const commandInstances: Partial<
  Record<BeanstalkCommand, Command<ICommandConfig[BeanstalkCommand]['expectedStatus'][number]>>
> = {};

export function getCommandInstance<Cmd extends BeanstalkCommand>(
  cmd: Cmd
): Command<ICommandConfig[Cmd]['expectedStatus'][number]> {
  let command = commandInstances[cmd] as Command<ICommandConfig[Cmd]['expectedStatus'][number]>;
  if (command) return command;

  const cfg = commandConfig[cmd] as ICommandCtorOptions<
    ICommandConfig[Cmd]['expectedStatus'][number]
  >;
  if (!cfg) {
    throw new CommandError(
      CommandErrorCode.ErrCommandUnknown,
      `Unknown beanstalk command '${cmd}'`
    );
  }

  command = new Command(cmd, cfg);
  commandInstances[cmd] = command;

  return command;
}
