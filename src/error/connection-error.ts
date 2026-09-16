import {ErrorWithCode} from './error-with-code.js';

export enum ConnectionErrorCode {
	ErrChangingState = 'ErrChangingState',
	ErrAlreadyOpened = 'ErrAlreadyOpened',
	ErrAlreadyClosed = 'ErrAlreadyClosed',
	ErrNotOpened = 'ErrNotOpened',
	ErrConnectTimeout = 'ErrConnectTimeout',
}

export class ConnectionError extends ErrorWithCode<ConnectionErrorCode> {
	name = 'ConnectionError' as const;
}
