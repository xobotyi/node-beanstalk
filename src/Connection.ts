import {EventEmitter} from 'node:events';
import {Socket} from 'node:net';
import {ConnectionError, ConnectionErrorCode} from './error/ConnectionError.js';

export type IConnectionEvents = {
	close: [];
	open: [port: number, host: string];
	error: [err: Error];
	data: [data: Buffer];
};

export type ConnectionState = 'open' | 'opening' | 'closed' | 'closing';

export class Connection extends EventEmitter<IConnectionEvents> {
	private _socket?: Socket;

	private _state: ConnectionState = 'closed';

	getState(): ConnectionState {
		return this._state;
	}

	isChangingState(): boolean {
		return this._state === 'opening' || this._state === 'closing';
	}

	async open(port: number, host = 'localhost'): Promise<void> {
		if (this.isChangingState()) {
			throw new ConnectionError(
				ConnectionErrorCode.ErrChangingState,
				`Unable to open connection that is already changing it's state`,
			);
		}

		if (this._state === 'open') {
			throw new ConnectionError(
				ConnectionErrorCode.ErrAlreadyOpened,
				`Unable to open connection that is already opened`,
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
				.on('error', (err) => {
					reject(err);
				})
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

		if (this._state === 'closed') {
			throw new ConnectionError(
				ConnectionErrorCode.ErrAlreadyClosed,
				`Unable to close connection that is already closed`,
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

	/**
	 * Closes the connection if it is open, so `await using` releases the socket on scope exit.
	 */
	async [Symbol.asyncDispose](): Promise<void> {
		if (this._state !== 'open') return;

		await this.close();
	}

	async write<T extends Buffer>(buffer: T): Promise<T> {
		const sock = this._socket;
		if (this._state !== 'open' || !sock) {
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
