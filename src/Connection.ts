import { EventEmitter } from 'events';
import { Socket } from 'net';
import { ConnectionError, ConnectionErrorCode } from './error/ConnectionError';

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

export type ConnectionState = 'open' | 'opening' | 'closed' | 'closing';

export class Connection extends EventEmitter {
  private _socket?: Socket;

  private _state: ConnectionState = 'closed';

  getState(): ConnectionState {
    return this._state;
  }

  isChangingState(): boolean {
    return this._state === 'opening' || this._state === 'closing';
  }

  /**
   * `timeoutMs > 0` bounds the dial. On expiry the socket is destroyed, `close` is emitted
   * and the promise rejects with `ErrConnectTimeout`. `0` leaves the dial to the OS.
   */
  async open(port: number, host = 'localhost', timeoutMs = 0): Promise<void> {
    if (this.isChangingState()) {
      throw new ConnectionError(
        ConnectionErrorCode.ErrChangingState,
        `Unable to open connection that is already changing it's state`
      );
    }

    if (this._state === 'open') {
      throw new ConnectionError(
        ConnectionErrorCode.ErrAlreadyOpened,
        `Unable to open connection that is already opened`
      );
    }

    this._state = 'opening';

    return new Promise<void>((resolve, reject) => {
      const socket = new Socket();
      this._socket = socket;

      let settled = false;
      let deadline: NodeJS.Timeout | undefined;
      const settle = () => {
        settled = true;
        clearTimeout(deadline);
      };
      const fail = (err: Error) => {
        settle();
        reject(err);
      };

      if (timeoutMs > 0) {
        deadline = setTimeout(() => {
          fail(
            new ConnectionError(
              ConnectionErrorCode.ErrConnectTimeout,
              `Connection not established within ${timeoutMs} ms`
            )
          );
          this.destroy();
        }, timeoutMs);
      }

      socket
        .setNoDelay(true)
        .setKeepAlive(true)
        .on('close', () => {
          this.handleSocketClose(socket);
          // A socket dropped while `opening` (by `destroy()`) settles the dial.
          if (!settled) {
            fail(
              new ConnectionError(
                ConnectionErrorCode.ErrNotOpened,
                'Socket closed before the connection was established'
              )
            );
          }
        })
        .on('error', (err: any) => {
          if (!settled) {
            fail(err);
            return;
          }

          // A socket dropped by `destroy()` or replaced by a later `open()` is not ours to report.
          if (this._socket !== socket) {
            return;
          }

          // ignore disconnect errors during disconnect procedure
          if (this._state === 'closing' && (err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
            return;
          }

          this.emit('error', err);
        })
        .on('data', (data) => this.emit('data', data))
        .connect(port, host, () => {
          settle();
          // A dial that lands after the deadline dropped this socket must not leave an orphan.
          if (this._socket !== socket) {
            socket.destroy();
            return;
          }

          this._state = 'open';

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          this.emit('open', socket.remotePort!, socket.remoteAddress!);

          resolve();
        });
    });
  }

  private handleSocketClose(socket: Socket): void {
    // A socket replaced by a later `open()` or dropped by `destroy()` already had its `close`.
    if (this._socket !== socket) {
      return;
    }

    this._state = 'closed';
    this._socket = undefined;
    this.emit('close');
  }

  async close(): Promise<void> {
    if (this.isChangingState()) {
      throw new ConnectionError(
        ConnectionErrorCode.ErrChangingState,
        `Unable to close connection that is already changing it's state`
      );
    }

    if (this._state === 'closed') {
      throw new ConnectionError(
        ConnectionErrorCode.ErrAlreadyClosed,
        `Unable to close connection that is already closed`
      );
    }

    this._state = 'closing';

    const sock = this._socket;
    if (!sock) {
      this._state = 'closed';
      return;
    }

    // `destroy()` returns before the socket emits `close`. `handleSocketClose`
    // sets the final state; a `close` listener may already have called `open()`.
    const closed = sock.closed
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          sock.once('close', resolve);
        });
    await new Promise<void>((resolve) => {
      sock.end(resolve);
    });
    sock.destroy();
    await closed;
  }

  /** Emits `close` synchronously; the later socket `close` event is ignored. */
  destroy(): void {
    const sock = this._socket;
    if (!sock) {
      return;
    }

    this._state = 'closed';
    this._socket = undefined;
    sock.destroy();
    this.emit('close');
  }

  async write<T extends Buffer>(buffer: T): Promise<T> {
    const sock = this._socket;
    if (this._state !== 'open' || !sock) {
      throw new ConnectionError(
        ConnectionErrorCode.ErrNotOpened,
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
