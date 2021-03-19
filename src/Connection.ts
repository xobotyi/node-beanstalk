import { EventEmitter } from 'events';
import { Socket } from 'net';
import { ConnectionError } from './error/ConnectionError';

export interface Connection {
  emit: ((event: string, listener: (...args: any[]) => void) => boolean) &
    ((event: 'end') => boolean) &
    ((event: 'connect', port: number, host: string) => boolean) &
    ((event: 'error', err: Error) => boolean) &
    ((event: 'data', data: Buffer) => boolean);

  on: ((event: string, listener: (...args: any[]) => void) => this) &
    ((event: 'end', listener: (...args: any[]) => void) => this) &
    ((event: 'connect', listener: (port: number, host: string) => void) => this) &
    ((event: 'error', listener: (err: Error) => void) => this) &
    ((event: 'data', listener: (data: Buffer) => void) => this);

  once: ((event: string, listener: (...args: any[]) => void) => this) &
    ((event: 'end', listener: (...args: any[]) => void) => this) &
    ((event: 'connect', listener: (port: number, host: string) => void) => this) &
    ((event: 'error', listener: (err: Error) => void) => this) &
    ((event: 'data', listener: (data: Buffer) => void) => this);

  prependListener: ((event: string, listener: (...args: any[]) => void) => this) &
    ((event: 'end', listener: (...args: any[]) => void) => this) &
    ((event: 'connect', listener: (port: number, host: string) => void) => this) &
    ((event: 'error', listener: (err: Error) => void) => this) &
    ((event: 'data', listener: (data: Buffer) => void) => this);

  prependOnceListener: ((event: string, listener: (...args: any[]) => void) => this) &
    ((event: 'end', listener: (...args: any[]) => void) => this) &
    ((event: 'connect', listener: (port: number, host: string) => void) => this) &
    ((event: 'error', listener: (err: Error) => void) => this) &
    ((event: 'data', listener: (data: Buffer) => void) => this);
}

export class Connection extends EventEmitter {
  private _socket?: Socket;

  private _ending = false;

  private _connecting = false;

  get isConnected(): boolean {
    // @ts-expect-error Poor nodejs socket type definition: https://nodejs.org/api/net.html#net_socket_readystate
    return this._socket?.readyState === 'open';
  }

  get isConnecting(): boolean {
    return this._connecting;
  }

  get isEnding(): boolean {
    return this._ending;
  }

  get socket(): Socket | undefined {
    return this._socket;
  }

  async connect(port: number, host = 'localhost'): Promise<void> {
    this._connecting = true;

    if (this._socket) {
      this._socket.destroy();
    }

    return new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      this._socket = socket;
      socket
        .setNoDelay(true)
        .setKeepAlive(true)
        .on('close', () => this.emit('end'))
        .on('error', (err) => reject(err))
        .on('data', (data) => this.emit('data', data))
        .connect(port, host, () => {
          socket.off('error', reject).on('error', (err: any) => {
            // ignore disconnect errors during disconnect procedure
            if (this._ending && (err.code === 'ECONNRESET' || err.code === 'EPIPE')) return;

            this.emit('error', err);
          });

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          this.emit('connect', socket.remotePort!, socket.remoteAddress!);

          resolve();
        });
    }).finally(() => {
      this._connecting = false;
    });
  }

  async end(): Promise<void> {
    const { _socket: sock } = this;

    if (!sock) return;

    this._ending = true;

    await new Promise<void>((resolve) => {
      sock.end(resolve);
    }).finally(() => {
      this._ending = false;
    });
  }

  async write<T extends Buffer>(buffer: T): Promise<T> {
    const { _socket: sock } = this;

    if (!sock) throw new ConnectionError('Unable to write, connection is not established yet.');

    return new Promise((resolve, reject) => {
      sock.write(buffer, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve(buffer);
        }
      });
    });
  }
}
