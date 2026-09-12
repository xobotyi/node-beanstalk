import {ErrorWithCode} from './error-with-code.js';

export enum CommandErrorCode {
	ErrCommandUnknown = 'ErrCommandUnknown',
	ErrResponseStatusUnknown = 'ErrResponseStatusUnknown',
	ErrUnexpectedResponseStatus = 'ErrUnexpectedResponseStatus',
	ErrErrorResponseStatus = 'ErrErrorResponseStatus',
}

export class CommandError extends ErrorWithCode<CommandErrorCode> {
	name = 'CommandError';
}
