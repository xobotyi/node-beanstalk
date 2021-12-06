import { load } from 'js-yaml';
import { CommandError, CommandErrorCode } from './error/CommandError';
import { CRLF_BUFF } from './const';
import {
  BeanstalkCommand,
  BeanstalkErrorResponseStatus,
  BeanstalkResponseStatus,
  IBeanstalkErrorResponseStatus,
  ICommandHandledResponse,
  ICommandResponse,
  Serializer,
} from './types';

export interface ICommandCtorOptions<R extends BeanstalkResponseStatus = BeanstalkResponseStatus> {
  payloadBody?: boolean;
  yamlBody?: boolean;
  expectedStatus?: readonly R[];
}

export class Command<R extends BeanstalkResponseStatus = BeanstalkResponseStatus> {
  private readonly commandName: BeanstalkCommand;

  private readonly opt: ICommandCtorOptions<R>;

  constructor(commandName: BeanstalkCommand, opt: ICommandCtorOptions<R> = {}) {
    if (!BeanstalkCommand[commandName]) {
      throw new CommandError(
        CommandErrorCode.ErrCommandUnknown,
        `Unknown beanstalk command '${commandName}'`
      );
    }

    this.opt = {
      payloadBody: opt.payloadBody ?? false,
      yamlBody: opt.yamlBody ?? false,
      expectedStatus: (opt.expectedStatus ?? []).map((status) => {
        if (!BeanstalkResponseStatus[status])
          throw new CommandError(
            CommandErrorCode.ErrResponseStatusUnknown,
            `Unknown beanstalk response status expected '${commandName}'`
          );

        return status;
      }),
    };

    this.commandName = commandName;
  }

  /**
   * Build command as buffer
   *
   * @private
   */
  public buildCommandBuffer(args: string[] = [], payload?: Buffer): Buffer {
    const parts = [this.commandName, ...args];

    if (payload) {
      parts.push(`${payload.length}`);
      return Buffer.concat([Buffer.from(parts.join(' ')), CRLF_BUFF, payload, CRLF_BUFF]);
    }

    return Buffer.concat([Buffer.from(parts.join(' ')), CRLF_BUFF]);
  }

  public handleResponse(
    response: ICommandResponse,
    serializer?: Serializer
  ): ICommandHandledResponse<R> {
    if (BeanstalkErrorResponseStatus[response.status as IBeanstalkErrorResponseStatus]) {
      throw new CommandError(
        CommandErrorCode.ErrErrorResponseStatus,
        `Error status '${response.status}' received in response to '${this.commandName}' command`
      );
    }

    if (!this.opt.expectedStatus?.includes(response.status as R)) {
      throw new CommandError(
        CommandErrorCode.ErrUnexpectedResponseStatus,
        `Unexpected status '${response.status}' received in response to '${this.commandName}' command`
      );
    }

    const res = {
      status: response.status,
      headers: response.headers,
    } as any;

    if (response.data) {
      res.data = response.data.slice(0, response.data.length - CRLF_BUFF.length);

      if (this.opt.payloadBody) {
        if (serializer) {
          res.data = serializer.deserialize(res.data);
        }
      } else if (this.opt.yamlBody) {
        res.data = load(res.data.toString());
      }
    }

    return res as ICommandHandledResponse<R>;
  }
}
