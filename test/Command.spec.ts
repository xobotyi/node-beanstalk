import { Buffer } from 'buffer';
import yaml from 'js-yaml';
import { Command } from '../src/Command';
import { BeanstalkCommand, BeanstalkResponseStatus } from '../src/types';
import { CommandError, CommandErrorCode } from '../src/error/CommandError';
import { JsonSerializer } from '../src/serializer/JsonSerializer';

describe('Command', () => {
  it('should be defined', () => {
    expect(Command).toBeDefined();
  });

  describe('construct', () => {
    it('should be constructable via new', () => {
      expect(new Command(BeanstalkCommand.bury)).toBeInstanceOf(Command);
    });

    it('should throw on unknown command', () => {
      try {
        // @ts-expect-error testing incompatible command
        // eslint-disable-next-line no-new
        new Command('totally unknown command');
        throw new Error('not thrown!');
      } catch (e) {
        expect(e).toBeInstanceOf(CommandError);
        expect(e.code).toBe(CommandErrorCode.ErrCommandUnknown);
      }
    });

    it('should throw if unknown status expected', () => {
      try {
        // eslint-disable-next-line no-new
        new Command(BeanstalkCommand.bury, {
          // @ts-expect-error testing incompatible status
          expectedStatus: ['totally unknown status'],
        });
        throw new Error('not thrown!');
      } catch (e) {
        expect(e).toBeInstanceOf(CommandError);
        expect(e.code).toBe(CommandErrorCode.ErrResponseStatusUnknown);
      }
    });
  });

  describe('buildCommandBuffer', () => {
    const cmd = new Command(BeanstalkCommand.bury);

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

    // eslint-disable-next-line no-restricted-syntax
    for (const test of tableTests) {
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      it(test.name, () => {
        expect(cmd.buildCommandBuffer(...test.in)).toStrictEqual(test.out);
      });
    }
  });

  describe('handleResponse', () => {
    it('should throw in case of error response', () => {
      const cmd = new Command(BeanstalkCommand.bury);

      try {
        cmd.handleResponse({ status: BeanstalkResponseStatus.UNKNOWN_COMMAND, headers: [] });
        throw new Error('not thrown!');
      } catch (e) {
        expect(e).toBeInstanceOf(CommandError);
        expect(e.code).toBe(CommandErrorCode.ErrErrorResponseStatus);
      }
    });

    it('should throw in case of unexpected response', () => {
      const cmd = new Command(BeanstalkCommand.bury);

      try {
        cmd.handleResponse({ status: BeanstalkResponseStatus.OK, headers: [] });
        throw new Error('not thrown!');
      } catch (e) {
        expect(e).toBeInstanceOf(CommandError);
        expect(e.code).toBe(CommandErrorCode.ErrUnexpectedResponseStatus);
      }
    });

    it('should return status and headers', () => {
      const cmd = new Command(BeanstalkCommand.bury, {
        expectedStatus: [BeanstalkResponseStatus.BURIED],
      });

      expect(
        cmd.handleResponse({
          status: BeanstalkResponseStatus.BURIED,
          headers: ['123'],
        })
      ).toStrictEqual({
        status: BeanstalkResponseStatus.BURIED,
        headers: ['123'],
      });
    });

    it('should parse json body with given serializer', () => {
      const cmd = new Command(BeanstalkCommand.bury, {
        expectedStatus: [BeanstalkResponseStatus.BURIED],
        payloadBody: true,
      });

      expect(
        cmd.handleResponse(
          {
            status: BeanstalkResponseStatus.BURIED,
            headers: ['123'],
            data: Buffer.from(`${JSON.stringify(['hello', 'world'])}\r\n`),
          },
          new JsonSerializer()
        )
      ).toStrictEqual({
        status: BeanstalkResponseStatus.BURIED,
        headers: ['123'],
        data: ['hello', 'world'],
      });
    });

    it('should return raw data if no serializer passed or body specification passed', () => {
      const cmd = new Command(BeanstalkCommand.bury, {
        expectedStatus: [BeanstalkResponseStatus.BURIED],
        payloadBody: true,
      });

      expect(
        cmd.handleResponse({
          status: BeanstalkResponseStatus.BURIED,
          headers: ['123'],
          data: Buffer.from(`${JSON.stringify(['hello', 'world'])}\r\n`),
        })
      ).toStrictEqual({
        status: BeanstalkResponseStatus.BURIED,
        headers: ['123'],
        data: Buffer.from(JSON.stringify(['hello', 'world'])),
      });

      const cmd2 = new Command(BeanstalkCommand.bury, {
        expectedStatus: [BeanstalkResponseStatus.BURIED],
      });

      expect(
        cmd2.handleResponse({
          status: BeanstalkResponseStatus.BURIED,
          headers: ['123'],
          data: Buffer.from(`${JSON.stringify(['hello', 'world'])}\r\n`),
        })
      ).toStrictEqual({
        status: BeanstalkResponseStatus.BURIED,
        headers: ['123'],
        data: Buffer.from(JSON.stringify(['hello', 'world'])),
      });
    });

    it('should parse json body with given serializer', () => {
      const cmd = new Command(BeanstalkCommand.bury, {
        expectedStatus: [BeanstalkResponseStatus.BURIED],
        yamlBody: true,
      });

      expect(
        cmd.handleResponse(
          {
            status: BeanstalkResponseStatus.BURIED,
            headers: ['123'],
            data: Buffer.from(`${yaml.dump(['hello', 'world'])}\r\n`),
          },
          new JsonSerializer()
        )
      ).toStrictEqual({
        status: BeanstalkResponseStatus.BURIED,
        headers: ['123'],
        data: ['hello', 'world'],
      });
    });
  });
});
