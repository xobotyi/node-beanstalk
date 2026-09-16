import {ErrorWithCode} from './error-with-code.js';

export const SerializerErrorCode = {
	ErrSerializeError: 'ErrSerializeError',
	ErrDeserializeError: 'ErrDeserializeError',
} as const satisfies Record<string, string>;
export type SerializerErrorCode = (typeof SerializerErrorCode)[keyof typeof SerializerErrorCode];

export class SerializerError extends ErrorWithCode<SerializerErrorCode> {
	name = 'SerializerError';
}
