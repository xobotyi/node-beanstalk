import {ErrorWithCode} from './error-with-code.js';

export const ResponseErrorCode = {
	ErrInvalidBodyLength: 'ErrInvalidBodyLength',
	ErrInvalidNumericHeader: 'ErrInvalidNumericHeader',
	ErrMissingHeader: 'ErrMissingHeader',
	ErrUnexpectedBody: 'ErrUnexpectedBody',
} as const satisfies Record<string, string>;
export type ResponseErrorCode = (typeof ResponseErrorCode)[keyof typeof ResponseErrorCode];

export class ResponseError extends ErrorWithCode<ResponseErrorCode> {
	name = 'ResponseError';
}
