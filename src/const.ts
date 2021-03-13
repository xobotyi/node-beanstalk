export const CRLF = '\r\n';
export const CRLF_BUFF = Buffer.from(CRLF);

export enum BeanstalkCommand {
  put = 'put',
  use = 'use',
  reserve = 'reserve',
  'reserve-with-timeout' = 'reserve-with-timeout',
  'reserve-job' = 'reserve-job',
  delete = 'delete',
  release = 'release',
  bury = 'bury',
  touch = 'touch',
  watch = 'watch',
  ignore = 'ignore',
  peek = 'peek',
  'peek-ready' = 'peek-ready',
  'peek-delayed' = 'peek-delayed',
  'peek-buried' = 'peek-buried',
  kick = 'kick',
  'kick-job' = 'kick-job',
  stats = 'stats',
  'stats-job' = 'stats-job',
  'stats-tube' = 'stats-tube',
  'list-tubes' = 'list-tubes',
  'list-tube-used' = 'list-tube-used',
  'list-tubes-watched' = 'list-tubes-watched',
  'pause-tube' = 'pause-tube',
  quit = 'quit',
}

export enum BeanstalkResponseStatus {
  BAD_FORMAT = 'BAD_FORMAT',
  BURIED = 'BURIED',
  DEADLINE_SOON = 'DEADLINE_SOON',
  DELETED = 'DELETED',
  DRAINING = 'DRAINING',
  EXPECTED_CRLF = 'EXPECTED_CRLF',
  FOUND = 'FOUND',
  INSERTED = 'INSERTED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  JOB_TOO_BIG = 'JOB_TOO_BIG',
  KICKED = 'KICKED',
  NOT_FOUND = 'NOT_FOUND',
  NOT_IGNORED = 'NOT_IGNORED',
  OK = 'OK',
  OUT_OF_MEMORY = 'OUT_OF_MEMORY',
  PAUSED = 'PAUSED',
  RELEASED = 'RELEASED',
  RESERVED = 'RESERVED',
  TIMED_OUT = 'TIMED_OUT',
  TOUCHED = 'TOUCHED',
  UNKNOWN_COMMAND = 'UNKNOWN_COMMAND',
  USING = 'USING',
  WATCHING = 'WATCHING',
}

export const BeanstalkDataResponseStatus = {
  [BeanstalkResponseStatus.OK]: BeanstalkResponseStatus.OK,
  [BeanstalkResponseStatus.RESERVED]: BeanstalkResponseStatus.RESERVED,
  [BeanstalkResponseStatus.FOUND]: BeanstalkResponseStatus.FOUND,
} as const;

export const BeanstalkErrorResponseStatus = {
  [BeanstalkResponseStatus.OUT_OF_MEMORY]: BeanstalkResponseStatus.OUT_OF_MEMORY,
  [BeanstalkResponseStatus.INTERNAL_ERROR]: BeanstalkResponseStatus.INTERNAL_ERROR,
  [BeanstalkResponseStatus.BAD_FORMAT]: BeanstalkResponseStatus.BAD_FORMAT,
  [BeanstalkResponseStatus.DRAINING]: BeanstalkResponseStatus.DRAINING,
  [BeanstalkResponseStatus.UNKNOWN_COMMAND]: BeanstalkResponseStatus.UNKNOWN_COMMAND,
} as const;

export const PRIORITY_MIN = 0;
export const PRIORITY_MAX = 2 ** 32 - 1;

export const DELAY_MIN = 0;
export const DELAY_MAX = 2 ** 32 - 1;

export const TTR_MIN = 0;
export const TTR_MAX = 2 ** 32 - 1;
