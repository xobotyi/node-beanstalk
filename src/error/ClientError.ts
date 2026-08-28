import { ErrorWithCode } from './ErrorWithCode';

export enum ClientErrorCode {
  ErrInvalidPayload = 'ErrInvalidPayload',
  ErrPayloadTooBig = 'ErrPayloadTooBig',
  ErrResponseRead = 'ErrResponseRead',
  ErrConnectionNotOpened = 'ErrConnectionNotOpened',
  ErrConnectionNotClosed = 'ErrConnectionNotClosed',
  ErrDisconnecting = 'ErrDisconnecting',
  ErrConnectionClosed = 'ErrConnectionClosed',
  ErrCommandTimeout = 'ErrCommandTimeout',
}

export class ClientError extends ErrorWithCode {
  name = 'ClientError';
}
