import {ErrorWithCode} from './error-with-code.js';

export const ConnectionErrorCode = {
	ErrChangingState: 'ErrChangingState',
	ErrAlreadyOpened: 'ErrAlreadyOpened',
	ErrAlreadyClosed: 'ErrAlreadyClosed',
	ErrNotOpened: 'ErrNotOpened',
	ErrConnectTimeout: 'ErrConnectTimeout',
} as const satisfies Record<string, string>;
export type ConnectionErrorCode = (typeof ConnectionErrorCode)[keyof typeof ConnectionErrorCode];

export class ConnectionError extends ErrorWithCode<ConnectionErrorCode> {
	name = 'ConnectionError' as const;
}
