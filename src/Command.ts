import yaml from 'js-yaml';
import { CommandError } from './error/CommandError';
import {
  DataResponseStatus,
  IDataResponseStatus,
  IResponseStatus,
  ResponseStatus,
} from './Response';
import type { Serializer } from './types';

export const BeanstalkCommand = {
  put: 'put',
  use: 'use',
  reserve: 'reserve',
  'reserve-with-timeout': 'reserve-with-timeout',
  delete: 'delete',
  release: 'release',
  bury: 'bury',
  touch: 'touch',
  watch: 'watch',
  ignore: 'ignore',
  peek: 'peek',
  'peek-ready': 'peek-ready',
  'peek-delayed': 'peek-delayed',
  'peek-buried': 'peek-buried',
  kick: 'kick',
  'kick-job': 'kick-job',
  stats: 'stats',
  'stats-job': 'stats-job',
  'stats-tube': 'stats-tube',
  'list-tubes': 'list-tubes',
  'list-tube-used': 'list-tube-used',
  'list-tubes-watched': 'list-tubes-watched',
  'pause-tube': 'pause-tube',
  quit: 'quit',
} as const;
export type IBeanstalkCommand = keyof typeof BeanstalkCommand;

const crlf = '\r\n';
const crlfBuffer = Buffer.from(crlf);

export interface ICommandResponseHeaders {
  status: IResponseStatus;
  hasData: boolean;
  dataLength: number;
  headers: string[];
  headersLineLen: number;
}

export interface ICommandResponse {
  status: IResponseStatus;
  headers: string[];
  data?: string;
}

export type ICommandHandledResponse =
  | {
      status: IDataResponseStatus;
      headers: string[];
      data: any;
    }
  | {
      status: IResponseStatus;
      headers: string[];
    };

export interface ICommandCtorOptions {
  payloadBody?: boolean;
  yamlBody?: boolean;
  expectedStatus?: IResponseStatus[];
}

export class Command {
  private readonly commandName: IBeanstalkCommand;

  private readonly opt: ICommandCtorOptions;

  constructor(commandName: IBeanstalkCommand, opt: ICommandCtorOptions = {}) {
    if (!BeanstalkCommand[commandName]) {
      throw new CommandError(`Unknown beanstalk command '${commandName}'`);
    }

    this.opt = {
      payloadBody: opt.payloadBody ?? false,
      yamlBody: opt.yamlBody ?? false,
      expectedStatus: (opt.expectedStatus ?? []).map((status) => {
        if (!ResponseStatus[status])
          throw new CommandError(`Unknown beanstalk response status expected '${commandName}'`);

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
      return Buffer.concat([Buffer.from(parts.join(' ')), crlfBuffer, payload, crlfBuffer]);
    }

    return Buffer.concat([Buffer.from(parts.join(' ')), crlfBuffer]);
  }

  public parseResponseHeaders(str: string): ICommandResponseHeaders | null {
    const firstCrlf = str.indexOf(crlf);

    if (firstCrlf === -1) return null;

    const [status, ...restHeaders] = str.substr(0, firstCrlf).split(' ') as [
      IResponseStatus,
      ...string[]
    ];
    const hasData = status in DataResponseStatus;
    let dataLength = 0;
    const headers = restHeaders;

    if (hasData) {
      dataLength = parseInt(headers.pop() as string, 10) ?? 0;
    }

    return {
      headersLineLen: firstCrlf + crlf.length,
      status,
      headers,
      hasData,
      dataLength: dataLength && dataLength + crlf.length,
    };
  }

  public handleResponse(
    response: ICommandResponse,
    serializer?: Serializer
  ): ICommandHandledResponse {
    const res = {
      status: response.status,
      headers: response.headers,
    } as any;

    if (response.data) {
      res.data = response.data.substr(0, response.data.length - crlf.length);

      if (this.opt.payloadBody) {
        res.data = serializer ? serializer.deserialize(res.data) : res.data;
      } else if (this.opt.yamlBody) {
        res.data = yaml.load(res.data);
      }
    }

    return res as ICommandHandledResponse;
  }
}
