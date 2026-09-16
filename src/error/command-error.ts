import {ErrorWithCode} from './error-with-code.js';

export const CommandErrorCode = {
	ErrCommandUnknown: 'ErrCommandUnknown',
	ErrResponseStatusUnknown: 'ErrResponseStatusUnknown',
	ErrUnexpectedResponseStatus: 'ErrUnexpectedResponseStatus',
	ErrErrorResponseStatus: 'ErrErrorResponseStatus',
} as const satisfies Record<string, string>;
export type CommandErrorCode = (typeof CommandErrorCode)[keyof typeof CommandErrorCode];

export class CommandError extends ErrorWithCode<CommandErrorCode> {
	name = 'CommandError';
}
