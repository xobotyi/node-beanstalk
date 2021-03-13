import * as net from 'net';
import { Socket, TcpNetConnectOpts } from 'net';
import EventEmitter from 'events';
import {
  BeanstalkJobState,
  IBeanstalkClientCtorOptions,
  IBeanstalkClientRawReservedJob,
  IBeanstalkJobStats,
  IBeanstalkStats,
  IBeanstalkTubeStats,
  ICommandHandledResponse,
  ICommandResponse,
  ICommandResponseHeaders,
} from './types';
import { JsonSerializer } from './serializer/JsonSerializer';
import { CommandError } from './error/CommandError';
import { Command } from './Command';
import { ConnectionError } from './error/ConnectionError';
import { ClientError } from './error/ClitenError';
import { getCommandInstance } from './util/getCommandInstance';
import { BeanstalkCommand, BeanstalkResponseStatus } from './const';
import { parseResponseHeaders } from './util/parseResponseHeaders';
import { BeanstalkError } from './error/BeanstalkError';
import {
  validateDelay,
  validateJobId,
  validatePriority,
  validateTimeout,
  validateTTR,
  validateTubeName,
} from './util/validator';

const OPT = Symbol('OPT');
const SOCK = Symbol('SOCK');
const WAIT = Symbol('WAIT');
const USING = Symbol('USING');
const WATCHING = Symbol('WATCHING');

export class BeanstalkClient extends EventEmitter {
  private readonly [OPT]: Required<IBeanstalkClientCtorOptions>;

  private [SOCK]: Socket | undefined;

  private [WAIT] = false;

  private [USING] = 'default';

  private [WATCHING]: string[] = [];

  constructor(options: IBeanstalkClientCtorOptions = {}) {
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

  private debug(argsGetter: () => Parameters<typeof console.debug>): void {
    if (this[OPT].debug) console.debug(argsGetter());
  }

  emit(event: string | symbol, ...args: any[]): boolean {
    this.debug(() => [`event: ${event.toString()}`, args]);

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
    } else if (!serializer) {
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

  private async dispatchCommand<R extends BeanstalkResponseStatus = BeanstalkResponseStatus>(
    cmd: Command<R>,
    args?: string[],
    payload?: any
  ): Promise<ICommandHandledResponse<R>> {
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

    const readPromise = this.readCommandResponse(sock);
    await new Promise<void>((resolve, reject) => {
      const cmdBuffer = cmd.buildCommandBuffer(args, this.payloadToBuffer(payload));
      sock.write(cmdBuffer, (err) => {
        if (err) {
          this.debug(() => ['command send error:', err]);
          reject(err);
        } else {
          this.debug(() => ['command sent:', cmdBuffer.toString()]);
          resolve();
        }
      });
    });
    const response = await readPromise;

    this.debug(() => ['response received:', response]);

    return cmd.handleResponse(response);
  }

  private readCommandResponse(sock: Socket): Promise<ICommandResponse> {
    return new Promise((resolve, reject) => {
      let responseStr = '';
      let headers: ICommandResponseHeaders | null = null;
      let dataReadTimeout: NodeJS.Timeout;

      const dataListener = (data: Buffer) => {
        responseStr += data.toString();

        if (!headers) {
          // check if headers already received
          headers = parseResponseHeaders(responseStr);

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

  // COMMANDS
  public async use(tubeName: string): Promise<string> {
    validateTubeName(tubeName);

    const cmd = getCommandInstance(BeanstalkCommand.use);

    const result = await this.dispatchCommand(cmd, [tubeName]);

    // eslint-disable-next-line prefer-destructuring
    this[USING] = result.headers[0];

    return this[USING];
  }

  public async put(
    payload: Exclude<any, undefined>,
    ttr: number = this[OPT].defaultTTR,
    priority: number = this[OPT].defaultPriority,
    delay: number = this[OPT].defaultDelay
  ): Promise<{ id: number; state: BeanstalkJobState.buried | BeanstalkJobState.ready }> {
    validateTTR(ttr);
    validatePriority(priority);
    validateDelay(delay);

    if (typeof payload === 'undefined') {
      throw new TypeError(`payload has to be a non-undefined value`);
    }

    const cmd = getCommandInstance(BeanstalkCommand.put);

    const result = await this.dispatchCommand(cmd, [`${priority}`, `${delay}`, `${ttr}`], payload);

    if (result.status === BeanstalkResponseStatus.JOB_TOO_BIG) {
      throw new BeanstalkError(
        `Provided job payload exceeds maximal server's 'max-job-size' config`,
        result.status
      );
    }

    if (result.status === BeanstalkResponseStatus.EXPECTED_CRLF) {
      throw new CommandError(`Got '${result.status}' status`);
    }

    if (result.status === BeanstalkResponseStatus.DRAINING) {
      throw new BeanstalkError(
        `Server is in 'drain mode' and no longer accepting new jobs.`,
        result.status
      );
    }

    return {
      id: parseInt(result.headers[0], 10),
      state:
        result.status === BeanstalkResponseStatus.BURIED
          ? BeanstalkJobState.buried
          : BeanstalkJobState.ready,
    };
  }

  public async reserve(): Promise<null | IBeanstalkClientRawReservedJob> {
    const cmd = getCommandInstance(BeanstalkCommand.reserve);

    const result = await this.dispatchCommand(cmd);

    if (result.status === BeanstalkResponseStatus.TIMED_OUT) {
      return null;
    }

    if (result.status === BeanstalkResponseStatus.DEADLINE_SOON) {
      throw new BeanstalkError(
        'One of jobs reserved by this client will reach deadline soon, release it first.',
        result.status
      );
    }

    return {
      id: parseInt(result.headers[0], 10),
      payload: result.data,
    };
  }

  public async reserveWithTimeout(timeout: number): Promise<null | IBeanstalkClientRawReservedJob> {
    validateTimeout(timeout);

    const cmd = getCommandInstance(BeanstalkCommand['reserve-with-timeout']);

    const result = await this.dispatchCommand(cmd, [`${timeout}`]);

    if (result.status === BeanstalkResponseStatus.TIMED_OUT) {
      return null;
    }

    if (result.status === BeanstalkResponseStatus.DEADLINE_SOON) {
      throw new BeanstalkError(
        'One of jobs reserved by this client will reach deadline soon, release it first.',
        result.status
      );
    }

    return {
      id: parseInt(result.headers[0], 10),
      payload: result.data,
    };
  }

  public async reserveJob(jobId: number): Promise<null | IBeanstalkClientRawReservedJob> {
    validateJobId(jobId);

    const cmd = getCommandInstance(BeanstalkCommand['reserve-job']);

    const result = await this.dispatchCommand(cmd, [`${jobId}`]);

    if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
      return null;
    }

    return {
      id: parseInt(result.headers[0], 10),
      payload: result.data,
    };
  }

  public async delete(jobId: number): Promise<boolean> {
    validateJobId(jobId);

    const cmd = getCommandInstance(BeanstalkCommand.delete);

    const result = await this.dispatchCommand(cmd, [`${jobId}`]);

    return result.status === BeanstalkResponseStatus.DELETED;
  }

  public async release(
    jobId: number,
    priority: number = this[OPT].defaultPriority,
    delay: number = this[OPT].defaultDelay
  ): Promise<null | BeanstalkJobState.buried | BeanstalkJobState.ready> {
    validateJobId(jobId);
    validatePriority(priority);
    validateDelay(delay);

    const cmd = getCommandInstance(BeanstalkCommand.release);

    const result = await this.dispatchCommand(cmd, [`${jobId}`, `${priority}`, `${delay}`]);

    if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
      return null;
    }

    return result.status === BeanstalkResponseStatus.BURIED
      ? BeanstalkJobState.buried
      : BeanstalkJobState.ready;
  }

  public async bury(jobId: number, priority: number = this[OPT].defaultPriority): Promise<boolean> {
    validateJobId(jobId);
    validatePriority(priority);

    const cmd = getCommandInstance(BeanstalkCommand.bury);

    const result = await this.dispatchCommand(cmd, [`${jobId}`, `${priority}`]);

    return result.status === BeanstalkResponseStatus.BURIED;
  }

  public async touch(jobId: number): Promise<boolean> {
    validateJobId(jobId);

    const cmd = getCommandInstance(BeanstalkCommand.touch);

    const result = await this.dispatchCommand(cmd, [`${jobId}`]);

    return result.status === BeanstalkResponseStatus.TOUCHED;
  }

  public async watch(tubeName: string): Promise<void> {
    validateTubeName(tubeName);

    const cmd = getCommandInstance(BeanstalkCommand.watch);

    const result = await this.dispatchCommand(cmd, [tubeName]);

    if (this[WATCHING].length !== parseInt(result.headers[0], 10)) {
      await this.listTubesWatched();
    }
  }

  public async ignore(tubeName: string): Promise<boolean> {
    validateTubeName(tubeName);

    const cmd = getCommandInstance(BeanstalkCommand.ignore);

    const result = await this.dispatchCommand(cmd, [tubeName]);

    if (result.status !== BeanstalkResponseStatus.WATCHING) {
      if (this[WATCHING].length !== parseInt(result.headers[0], 10)) {
        await this.listTubesWatched();
      }

      return true;
    }

    return false;
  }

  public async peek(jobId: number): Promise<null | IBeanstalkClientRawReservedJob> {
    validateJobId(jobId);

    const cmd = getCommandInstance(BeanstalkCommand.peek);

    const result = await this.dispatchCommand(cmd, [`${jobId}`]);

    if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
      return null;
    }

    return {
      id: parseInt(result.headers[0], 10),
      payload: result.data,
    };
  }

  public async peekReady(): Promise<null | IBeanstalkClientRawReservedJob> {
    const cmd = getCommandInstance(BeanstalkCommand['peek-ready']);

    const result = await this.dispatchCommand(cmd);

    if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
      return null;
    }

    return {
      id: parseInt(result.headers[0], 10),
      payload: result.data,
    };
  }

  public async peekDelayed(): Promise<null | IBeanstalkClientRawReservedJob> {
    const cmd = getCommandInstance(BeanstalkCommand['peek-delayed']);

    const result = await this.dispatchCommand(cmd);

    if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
      return null;
    }

    return {
      id: parseInt(result.headers[0], 10),
      payload: result.data,
    };
  }

  public async peekBuried(): Promise<null | IBeanstalkClientRawReservedJob> {
    const cmd = getCommandInstance(BeanstalkCommand['peek-buried']);

    const result = await this.dispatchCommand(cmd);

    if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
      return null;
    }

    return {
      id: parseInt(result.headers[0], 10),
      payload: result.data,
    };
  }

  public async kick(bound: number): Promise<number> {
    const cmd = getCommandInstance(BeanstalkCommand.kick);

    const result = await this.dispatchCommand(cmd, [`${bound}`]);

    return parseInt(result.headers[0], 10);
  }

  public async kickJob(jobId: number): Promise<boolean> {
    validateJobId(jobId);

    const cmd = getCommandInstance(BeanstalkCommand['kick-job']);

    const result = await this.dispatchCommand(cmd, [`${jobId}`]);

    return result.status === BeanstalkResponseStatus.KICKED;
  }

  public async stats(): Promise<IBeanstalkStats> {
    const cmd = getCommandInstance(BeanstalkCommand.stats);

    const result = await this.dispatchCommand(cmd);

    return result.data;
  }

  public async statsTube(tubeName: string): Promise<IBeanstalkTubeStats | null> {
    const cmd = getCommandInstance(BeanstalkCommand['stats-tube']);

    const result = await this.dispatchCommand(cmd, [tubeName]);

    if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
      return null;
    }

    return result.data;
  }

  public async statsJob(jobId: number): Promise<IBeanstalkJobStats | null> {
    const cmd = getCommandInstance(BeanstalkCommand['stats-job']);

    const result = await this.dispatchCommand(cmd, [`${jobId}`]);

    if (result.status === BeanstalkResponseStatus.NOT_FOUND) {
      return null;
    }

    return result.data;
  }

  public async listTubes(): Promise<string[]> {
    const cmd = getCommandInstance(BeanstalkCommand['list-tubes']);

    const result = await this.dispatchCommand(cmd);

    return result.data;
  }

  public async listTubeUsed(): Promise<string> {
    const cmd = getCommandInstance(BeanstalkCommand['list-tube-used']);

    const result = await this.dispatchCommand(cmd);

    return result.headers[0];
  }

  public async listTubesWatched(): Promise<string[]> {
    const cmd = getCommandInstance(BeanstalkCommand['list-tubes-watched']);

    const result = await this.dispatchCommand(cmd);

    this[WATCHING] = result.data;

    return result.data;
  }

  public async pauseTube(tubeName: string, delay: number): Promise<boolean> {
    validateTubeName(tubeName);
    validateDelay(delay);

    const cmd = getCommandInstance(BeanstalkCommand['pause-tube']);

    const result = await this.dispatchCommand(cmd, [tubeName, `${delay}`]);

    return result.status === BeanstalkResponseStatus.PAUSED;
  }
}
