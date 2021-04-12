import { ErrorWithCode } from './ErrorWithCode';

export enum CommandErrorCode {
  ErrCommandUnknown = 'ErrCommandUnknown',
}

export class CommandError extends ErrorWithCode<CommandErrorCode> {
  name = 'CommandError';
}
