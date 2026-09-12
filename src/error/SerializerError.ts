import {ErrorWithCode} from './ErrorWithCode.js';

export enum SerializerErrorCode {
	ErrSerializeError = 'ErrSerializeError',
	ErrDeserializeError = 'ErrDeserializeError',
}

export class SerializerError extends ErrorWithCode<SerializerErrorCode> {
	name = 'SerializerError';
}
