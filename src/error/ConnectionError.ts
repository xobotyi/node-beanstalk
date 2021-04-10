import { ErrorWithCode } from './ErrorWithCode';

export enum ConnectionErrorCode {
  ErrChangingState = 'ErrChangingState',
  ErrAlreadyOpened = 'ErrAlreadyOpened',
  ErrAlreadyClosed = 'ErrAlreadyClosed',
  ErrNotOpened = 'ErrNotOpened',
}

export class ConnectionError extends ErrorWithCode<ConnectionErrorCode> {
  readonly name = 'ConnectionError';
}
