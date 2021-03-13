export const ResponseStatus = {
  BAD_FORMAT: 'BAD_FORMAT',
  BURIED: 'BURIED',
  DEADLINE_SOON: 'DEADLINE_SOON',
  DELETED: 'DELETED',
  DRAINING: 'DRAINING',
  EXPECTED_CRLF: 'EXPECTED_CRLF',
  FOUND: 'FOUND',
  INSERTED: 'INSERTED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  JOB_TOO_BIG: 'JOB_TOO_BIG',
  KICKED: 'KICKED',
  NOT_FOUND: 'NOT_FOUND',
  NOT_IGNORED: 'NOT_IGNORED',
  OK: 'OK',
  OUT_OF_MEMORY: 'OUT_OF_MEMORY',
  PAUSED: 'PAUSED',
  RELEASED: 'RELEASED',
  RESERVED: 'RESERVED',
  TIMED_OUT: 'TIMED_OUT',
  TOUCHED: 'TOUCHED',
  UNKNOWN_COMMAND: 'UNKNOWN_COMMAND',
  USING: 'USING',
  WATCHING: 'WATCHING',
} as const;
export type IResponseStatus = keyof typeof ResponseStatus;

export const DataResponseStatus = {
  [ResponseStatus.OK]: ResponseStatus.OK,
  [ResponseStatus.RESERVED]: ResponseStatus.RESERVED,
  [ResponseStatus.FOUND]: ResponseStatus.FOUND,
} as const;
export type IDataResponseStatus = keyof typeof DataResponseStatus;

export const ErrorResponseStatus = {
  [ResponseStatus.OUT_OF_MEMORY]: ResponseStatus.OUT_OF_MEMORY,
  [ResponseStatus.INTERNAL_ERROR]: ResponseStatus.INTERNAL_ERROR,
  [ResponseStatus.BAD_FORMAT]: ResponseStatus.BAD_FORMAT,
  [ResponseStatus.DRAINING]: ResponseStatus.DRAINING,
  [ResponseStatus.UNKNOWN_COMMAND]: ResponseStatus.UNKNOWN_COMMAND,
} as const;
export type IErrorResponseStatus = keyof typeof ErrorResponseStatus;
