import {ErrorWithCode} from './ErrorWithCode.js';

export enum ConnectionErrorCode {
	ErrChangingState = 'ErrChangingState',
	ErrAlreadyOpened = 'ErrAlreadyOpened',
	ErrAlreadyClosed = 'ErrAlreadyClosed',
	ErrNotOpened = 'ErrNotOpened',
}

export class ConnectionError extends ErrorWithCode<ConnectionErrorCode> {
	readonly name = 'ConnectionError';
}
