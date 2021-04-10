import { EventEmitter } from 'events';
import { Socket } from 'net';
import { ConnectionError } from './error/ConnectionError';

export interface Connection {
  emit: ((event: string, listener: (...args: any[]) => void) => boolean) &
    ((event: 'close') => boolean) &
    ((event: 'open', port: number, host: string) => boolean) &
    ((event: 'error', err: Error) => boolean) &
    ((event: 'data', data: Buffer) => boolean);

  on: ((event: string, listener: (...args: any[]) => void) => this) &
    ((event: 'close', listener: (...args: any[]) => void) => this) &
    ((event: 'open', listener: (port: number, host: string) => void) => this) &
    ((event: 'error', listener: (err: Error) => void) => this) &
    ((event: 'data', listener: (data: Buffer) => void) => this);

  once: ((event: string, listener: (...args: any[]) => void) => this) &
    ((event: 'close', listener: (...args: any[]) => void) => this) &
    ((event: 'open', listener: (port: number, host: string) => void) => this) &
    ((event: 'error', listener: (err: Error) => void) => this) &
    ((event: 'data', listener: (data: Buffer) => void) => this);

  prependListener: ((event: string, listener: (...args: any[]) => void) => this) &
    ((event: 'close', listener: (...args: any[]) => void) => this) &
    ((event: 'open', listener: (port: number, host: string) => void) => this) &
    ((event: 'error', listener: (err: Error) => void) => this) &
    ((event: 'data', listener: (data: Buffer) => void) => this);

  prependOnceListener: ((event: string, listener: (...args: any[]) => void) => this) &
    ((event: 'close', listener: (...args: any[]) => void) => this) &
    ((event: 'open', listener: (port: number, host: string) => void) => this) &
    ((event: 'error', listener: (err: Error) => void) => this) &
    ((event: 'data', listener: (data: Buffer) => void) => this);
}

type ConnectionState = 'open' | 'opening' | 'closed' | 'closing';

export class Connection extends EventEmitter {
  private _socket?: Socket;

  private _state: ConnectionState = 'closed';

  get state(): ConnectionState {
    return this._state;
  }

  get isChangingState(): boolean {
    return this._state === 'opening' || this._state === 'closing';
  }

  async open(port: number, host = 'localhost'): Promise<void> {
    if (this.isChangingState) {
      throw new ConnectionError(
        'ErrChangingState',
        `Unable to open connection that is already changing it's state`
      );
    }

    if (this._state === 'open') {
      throw new ConnectionError(
        'ErrAlreadyOpened',
        `Unable to open connection that is already opened`
      );
    }

    this._state = 'opening';

    return new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      this._socket = socket;
      socket
        .setNoDelay(true)
        .setKeepAlive(true)
        .on('close', () => this.emit('close'))
        .on('error', (err) => reject(err))
        .on('data', (data) => this.emit('data', data))
        .connect(port, host, () => {
          socket.off('error', reject).on('error', (err: any) => {
            // ignore disconnect errors during disconnect procedure
            if (this._state === 'closing' && (err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
              return;
            }

            this.emit('error', err);
          });

          this._state = 'open';

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          this.emit('open', socket.remotePort!, socket.remoteAddress!);

          resolve();
        });
    });
  }

  async close(): Promise<void> {
    if (this.isChangingState) {
      throw new ConnectionError(
        'ErrChangingState',
        `Unable to close connection that is already changing it's state`
      );
    }

    if (this._state === 'closed') {
      throw new ConnectionError(
        'ErrAlreadyClosed',
        `Unable to close connection that is already closed`
      );
    }

    this._state = 'closing';

    const sock = this._socket;
    if (sock) {
      await new Promise<void>((resolve) => {
        sock.end(resolve);
      });
      await sock.destroy();
    }

    this._socket = undefined;
    this._state = 'closed';
  }

  async write<T extends Buffer>(buffer: T): Promise<T> {
    const sock = this._socket;
    if (this._state !== 'open' || !sock) {
      throw new ConnectionError(
        'ErrNotOpened',
        'Unable to write to connection that is not opened yet'
      );
    }

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
