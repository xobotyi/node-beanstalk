import { ErrorWithCode } from './ErrorWithCode';

export enum ResponseErrorCode {
  ErrInvalidBodyLength = 'ErrInvalidBodyLength',
}

export class ResponseError extends ErrorWithCode<ResponseErrorCode> {
  name = 'ResponseError';
}
