import {ErrorWithCode} from './ErrorWithCode.js';

export enum ResponseErrorCode {
	ErrInvalidBodyLength = 'ErrInvalidBodyLength',
}

export class ResponseError extends ErrorWithCode<ResponseErrorCode> {
	name = 'ResponseError';
}
