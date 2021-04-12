import { ErrorWithCode } from './ErrorWithCode';

export enum CommandErrorCode {
  ErrCommandUnknown = 'ErrCommandUnknown',
  ErrResponseStatusUnknown = 'ErrResponseStatusUnknown',
  ErrUnexpectedResponseStatus = 'ErrUnexpectedResponseStatus',
  ErrErrorResponseStatus = 'ErrErrorResponseStatus',
}

export class CommandError extends ErrorWithCode<CommandErrorCode> {
  name = 'CommandError';
}
