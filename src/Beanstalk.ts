import * as net from 'net';
import { Socket, TcpNetConnectOpts } from 'net';
import EventEmitter from 'events';
import { Serializer } from './types';
import { JsonSerializer } from './serializer/JsonSerializer';
import { CommandError } from './error/CommandError';
import { BeanstalkCommand, Command, ICommandResponse, ICommandResponseHeaders } from './Command';
import { ConnectionError } from './error/ConnectionError';
import { ClientError } from './error/ClitenError';

export interface IBeanstalkOptions {
  /**
   * Connection host.
   *
   * @default 127.0.0.1
   */
  host?: string;

  /**
   * Connection port.
   *
   * @default 11300
   */
  port?: number;

  /**
   * Default job priority.
   *
   * @default 1024
   */
  defaultPriority?: number;

  /**
   * Default delay value in seconds for `put` and `release` commands.
   *
   * @default 0
   */
  defaultDelay?: number;

  /**
   * Default TTR value in seconds for `put` command.
   *
   * @default 30
   */
  defaultTTR?: number;

  /**
   * @default false
   */
  debug?: boolean;

  /**
   * Serializer that will process job data
   */
  serializer?: Serializer;

  /**
   * Maximal payload size in bytes
   *
   * @default 65_536
   */
  maxPayloadSize?: number;

  /**
   * Time in milliseconds which client will wait for data chunks.
   * If full data will not be read in given amount of time, client
   * will quit (disconnect and throw error).
   *
   * @default 1000
   */
  dataReadTimeout?: number;
}

const OPT = Symbol('OPT');
const SOCK = Symbol('SOCK');
const WAIT = Symbol('WAIT');

export class Beanstalk extends EventEmitter {
  private readonly [OPT]: Required<IBeanstalkOptions>;

  private [SOCK]: Socket | undefined;

  [WAIT] = false;

  constructor(options: IBeanstalkOptions = {}) {
    super();

    this[OPT] = {
      host: options.host ?? '127.0.0.1',
      port: options.port ?? 11300,
      defaultPriority: options.defaultPriority ?? 1024,
      defaultDelay: options.defaultDelay ?? 0,
      defaultTTR: options.defaultTTR ?? 30,
      debug: options.debug ?? false,
      serializer: options.serializer ?? new JsonSerializer(),
      maxPayloadSize: options.maxPayloadSize ?? 65_536,
      dataReadTimeout: options.dataReadTimeout ?? 1000,
    };
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    if (this[OPT].debug) {
      console.debug(`event: ${event.toString()}`, args);
    }

    return super.emit(event, ...args);
  }

  private async attachSocketListeners(socket: Socket) {
    socket.on('connect', () => {
      this.emit('connect', { port: socket.remotePort, host: socket.remoteAddress });
    });

    socket.on('error', (...args) => {
      this.emit('error', ...args);
    });

    socket.on('end', (...args) => {
      this.emit('end', ...args);
    });

    socket.on('close', (...args) => {
      this.emit('close', ...args);
    });
  }

  public async connect({
    port = this[OPT].port,
    host = this[OPT].host,
    timeout = 0,
    ...restConnectOptions
  }: Partial<TcpNetConnectOpts> = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ ...restConnectOptions, port, host, timeout });
      this[SOCK] = sock;

      sock.setNoDelay(true);
      sock.setKeepAlive(true);

      sock.once('connect', () => {
        resolve();
      });

      sock.once('error', (err) => {
        reject(err);
      });

      this.attachSocketListeners(sock);
    });
  }

  public async disconnect(): Promise<void> {
    const sock = this[SOCK];
    this[SOCK] = undefined;

    if (!sock) return;

    await new Promise<void>((resolve) => sock.end(resolve));
    sock.destroy();
  }

  /**
   * @throws {CommandError}
   * @private
   */
  private payloadToBuffer(payload: any): Buffer | undefined {
    if (payload === undefined) return undefined;

    let payloadBuffer: Buffer;
    const { serializer, maxPayloadSize } = this[OPT];

    if (typeof payload === 'string' || typeof payload === 'number') {
      payloadBuffer = Buffer.from(payload.toString());
    } else if (!this[OPT].serializer) {
      throw new CommandError(
        `Serializer not defined, payload has to be string or number, got ${typeof payload}. Configure serializer or serialize payload manually.`
      );
    } else {
      payloadBuffer = Buffer.from(serializer.serialize(payload));
    }

    if (payloadBuffer.length > maxPayloadSize) {
      throw new CommandError(
        `Maximal payload size is ${maxPayloadSize} bytes, got ${payloadBuffer.length}`
      );
    }

    return payloadBuffer;
  }

  private async dispatchCommand(cmd: Command, args?: string[], payload?: any) {
    if (this[WAIT]) {
      throw new ClientError('Client is waiting for response.');
    }

    const sock = this[SOCK];
    if (!sock) {
      throw new ConnectionError('Socket connection is not initialized, call .connect() first.');
    }

    // @ts-expect-error Poor nodejs socket type definition: https://nodejs.org/api/net.html#net_socket_readystate
    if (sock.readyState !== 'open') {
      throw new ConnectionError('Socket connection initialized but not open yet.');
    }

    const readPromise = this.readCommandResponse(sock, cmd);
    await new Promise<void>((resolve, reject) => {
      sock.write(cmd.buildCommandBuffer(args, this.payloadToBuffer(payload)), (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    const response = await readPromise;

    console.log(cmd.handleResponse(response));
  }

  private readCommandResponse(sock: Socket, cmd: Command): Promise<ICommandResponse> {
    return new Promise((resolve, reject) => {
      let responseStr = '';
      let headers: ICommandResponseHeaders | null = null;
      let dataReadTimeout: NodeJS.Timeout;

      const dataListener = (data: Buffer) => {
        responseStr += data.toString();

        if (!headers) {
          // check if headers already received
          headers = cmd.parseResponseHeaders(responseStr);

          if (headers) {
            responseStr = responseStr.slice(headers.headersLineLen);

            if (headers.hasData) {
              if (responseStr.length < headers.dataLength) {
                // if response data not read - start read timeout
                dataReadTimeout = setTimeout(() => {
                  sock.off('data', dataListener);
                  reject(
                    new ClientError(
                      `Failed to read response data after ${this[OPT].dataReadTimeout} ms`
                    )
                  );
                }, this[OPT].dataReadTimeout);
              }
            }
          }
        }

        if (headers) {
          if (headers.hasData) {
            if (responseStr.length >= headers.dataLength) {
              // response data is read, we're done
              clearTimeout(dataReadTimeout);
              sock.off('data', dataListener);
              resolve({
                status: headers.status,
                headers: headers.headers,
                data: responseStr.substr(0, headers.dataLength),
              });
            }
          } else {
            sock.off('data', dataListener);
            resolve({
              status: headers.status,
              headers: headers.headers,
            });
          }
        }
      };

      sock.on('data', dataListener);
    });
  }

  public async stats() {
    const cmd = new Command(BeanstalkCommand.stats, { yamlBody: true });

    await this.dispatchCommand(cmd);
  }
}
