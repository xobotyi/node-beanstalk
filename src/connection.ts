import {EventEmitter} from 'node:events';
import {Socket} from 'node:net';
import {ConnectionError, ConnectionErrorCode} from './error/connection-error.js';

export type IConnectionEvents = {
	close: [];
	open: [port: number, host: string];
	error: [err: Error];
	data: [data: Buffer];
};

export type ConnectionState = 'open' | 'opening' | 'closed' | 'closing';

export class Connection extends EventEmitter<IConnectionEvents> {
	#socket?: Socket;

	#state: ConnectionState = 'closed';

	getState(): ConnectionState {
		return this.#state;
	}

	isChangingState(): boolean {
		return this.#state === 'opening' || this.#state === 'closing';
	}

	async open(port: number, host = 'localhost'): Promise<void> {
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
			socket
				.setNoDelay(true)
				.setKeepAlive(true)
				.on('close', () => {
					this.emit('close');
				})
				.on('error', (err) => {
					reject(err);
				})
				// constraint: no `setEncoding` call on this socket, so `data` always carries a Buffer
				.on('data', (data: Buffer) => {
					this.emit('data', data);
				})
				.connect(port, host, () => {
					socket.off('error', reject).on('error', (err: NodeJS.ErrnoException) => {
						// ignore disconnect errors during disconnect procedure
						if (this.#state === 'closing' && (err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
							return;
						}

						this.emit('error', err);
					});

					this.#state = 'open';

					this.emit('open', socket.remotePort!, socket.remoteAddress!);

					resolve();
				});
		});
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
		if (sock) {
			await new Promise<void>((resolve) => {
				sock.end(resolve);
			});
			sock.destroy();
		}

		this.#socket = undefined;
		this.#state = 'closed';
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
