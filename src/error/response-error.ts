import {ErrorWithCode} from './error-with-code.js';

export enum ResponseErrorCode {
	ErrInvalidBodyLength = 'ErrInvalidBodyLength',
	ErrInvalidNumericHeader = 'ErrInvalidNumericHeader',
}

export class ResponseError extends ErrorWithCode<ResponseErrorCode> {
	name = 'ResponseError';
}
