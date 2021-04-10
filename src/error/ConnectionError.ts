export type ConnectionErrorCode =
  | 'ErrChangingState'
  | 'ErrAlreadyOpened'
  | 'ErrAlreadyClosed'
  | 'ErrNotOpened';

export class ConnectionError extends Error {
  name = 'ConnectionError';

  readonly code: ConnectionErrorCode;

  constructor(code: ConnectionErrorCode, message: string) {
    super(message);

    this.code = code;
  }
}
