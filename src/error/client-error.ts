import {ErrorWithCode} from './error-with-code.js';

export const ClientErrorCode = {
	ErrInvalidPayload: 'ErrInvalidPayload',
	ErrPayloadTooBig: 'ErrPayloadTooBig',
	ErrResponseRead: 'ErrResponseRead',
	ErrConnectionNotOpened: 'ErrConnectionNotOpened',
	ErrConnectionNotClosed: 'ErrConnectionNotClosed',
	ErrConnectionClosed: 'ErrConnectionClosed',
	ErrResponseTimeout: 'ErrResponseTimeout',
	ErrDisconnecting: 'ErrDisconnecting',
} as const satisfies Record<string, string>;
export type ClientErrorCode = (typeof ClientErrorCode)[keyof typeof ClientErrorCode];

export class ClientError extends ErrorWithCode {
	name = 'ClientError';
}
