import {EventEmitter} from 'node:events';
import {Socket} from 'node:net';
import {ConnectionError, ConnectionErrorCode} from './error/connection-error.js';

export type ConnectionEvents = {
	close: [];
	open: [port: number, host: string];
	error: [err: Error];
	data: [data: Buffer];
};

export type ConnectionState = 'open' | 'opening' | 'closed' | 'closing';

export class Connection extends EventEmitter<ConnectionEvents> {
	#socket: Socket | undefined;

	#state: ConnectionState = 'closed';

	getState(): ConnectionState {
		return this.#state;
	}

	isChangingState(): boolean {
		return this.#state === 'opening' || this.#state === 'closing';
	}

	/**
	 * Dials {host}:{port}. A {timeoutMs} above zero bounds the dial: on expiry the socket is dropped and the promise
	 * rejects with `ErrConnectTimeout`, where zero leaves the wait to the operating system.
	 */
	async open(port: number, host = 'localhost', timeoutMs = 0): Promise<void> {
		if (this.isChangingState()) {
			throw new ConnectionError(
				ConnectionErrorCode.ErrChangingState,
				`Unable to open connection that is already changing it's state`,
			);
		}

		if (this.#state === 'open') {
			throw new ConnectionError(
				ConnectionErrorCode.ErrAlreadyOpened,
				`Unable to open connection that is already opened`,
			);
		}

		this.#state = 'opening';

		return new Promise<void>((resolve, reject) => {
			const socket = new Socket();
			this.#socket = socket;

			let dialSettled = false;
			let dialFailure: Error | undefined;
			let dialTimeout: NodeJS.Timeout | undefined;

			if (timeoutMs > 0) {
				dialTimeout = setTimeout(() => {
					dialFailure = new ConnectionError(
						ConnectionErrorCode.ErrConnectTimeout,
						`Connection to ${host}:${port} not established within ${timeoutMs} ms`,
					);
					socket.destroy();
				}, timeoutMs);
			}

			socket
				.setNoDelay(true)
				.setKeepAlive(true)
				.on('close', () => {
					this.handleSocketClose(socket);

					if (!dialSettled) {
						dialSettled = true;
						clearTimeout(dialTimeout);
						reject(
							dialFailure ??
								new ConnectionError(
									ConnectionErrorCode.ErrNotOpened,
									'Socket closed before the connection was established',
								),
						);
					}
				})
				.on('error', (err: NodeJS.ErrnoException) => {
					if (!dialSettled) {
						// constraint: a destroyed socket always emits `close`, so the dial settles there with the state final
						dialFailure = err;
						socket.destroy();

						return;
					}

					// ignore disconnect errors during disconnect procedure
					if (this.#state === 'closing' && (err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
						return;
					}

					this.emit('error', err);
				})
				// constraint: no `setEncoding` call on this socket, so `data` always carries a Buffer
				.on('data', (data: Buffer) => {
					this.emit('data', data);
				})
				.connect(port, host, () => {
					dialSettled = true;
					clearTimeout(dialTimeout);
					this.#state = 'open';

					this.emit('open', socket.remotePort!, socket.remoteAddress!);

					resolve();
				});
		});
	}

	/**
	 * Settles the state a dying socket leaves behind. A socket that a later `open()` replaced is not this
	 * connection's socket any more and its `close` changes nothing.
	 */
	private handleSocketClose(socket: Socket): void {
		if (this.#socket !== socket) return;

		this.#state = 'closed';
		this.#socket = undefined;

		this.emit('close');
	}

	async close(): Promise<void> {
		if (this.isChangingState()) {
			throw new ConnectionError(
				ConnectionErrorCode.ErrChangingState,
				`Unable to close connection that is already changing it's state`,
			);
		}

		if (this.#state === 'closed') {
			throw new ConnectionError(
				ConnectionErrorCode.ErrAlreadyClosed,
				`Unable to close connection that is already closed`,
			);
		}

		this.#state = 'closing';

		const sock = this.#socket;
		if (!sock) {
			this.#state = 'closed';

			return;
		}

		const closed = new Promise<void>((resolve) => {
			sock.once('close', resolve);
		});

		await new Promise<void>((resolve) => {
			sock.end(resolve);
		});
		sock.destroy();

		await closed;
	}

	/**
	 * Closes the connection if it is open, so `await using` releases the socket on scope exit.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		if (this.#state !== 'open') return;

		await this.close();
	}

	async write<T extends Buffer>(buffer: T): Promise<T> {
		const sock = this.#socket;
		if (this.#state !== 'open' || !sock) {
			throw new ConnectionError(
				ConnectionErrorCode.ErrNotOpened,
				'Unable to write to connection that is not opened yet',
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
