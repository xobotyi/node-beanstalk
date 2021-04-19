import { ErrorWithCode } from './ErrorWithCode';

export enum ClientErrorCode {
  ErrInvalidPayload = 'ErrInvalidPayload',
  ErrPayloadTooBig = 'ErrPayloadTooBig',
  ErrResponseRead = 'ErrResponseRead',
  ErrConnectionNotOpened = 'ErrConnectionNotOpened',
  ErrConnectionNotClosed = 'ErrConnectionNotClosed',
  ErrDisconnecting = 'ErrDisconnecting',
}

export class ClientError extends ErrorWithCode {
  name = 'ClientError';
}
