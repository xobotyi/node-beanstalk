import {ErrorWithCode} from './error-with-code.js';

export enum ClientErrorCode {
	ErrInvalidPayload = 'ErrInvalidPayload',
	ErrPayloadTooBig = 'ErrPayloadTooBig',
	ErrResponseRead = 'ErrResponseRead',
	ErrConnectionNotOpened = 'ErrConnectionNotOpened',
	ErrConnectionNotClosed = 'ErrConnectionNotClosed',
	ErrConnectionClosed = 'ErrConnectionClosed',
	ErrDisconnecting = 'ErrDisconnecting',
}

export class ClientError extends ErrorWithCode {
	name = 'ClientError';
}
