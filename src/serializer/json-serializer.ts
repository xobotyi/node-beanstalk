import {type Serializer} from '../types.js';
import {SerializerError, SerializerErrorCode} from '../error/serializer-error.js';

function errorMessage(error: unknown): string {
	if (Error.isError(error)) return error.message;

	return typeof error === 'string' ? error : 'non-Error value thrown';
}

export class JsonSerializer implements Serializer {
	public serialize(data: any): Buffer {
		try {
			return Buffer.from(JSON.stringify(data), 'utf8');
		} catch (error: unknown) {
			throw new SerializerError(SerializerErrorCode.ErrSerializeError, errorMessage(error));
		}
	}

	public deserialize(buffer: Buffer): any {
		try {
			return JSON.parse(buffer.toString('utf8'));
		} catch (error: unknown) {
			throw new SerializerError(SerializerErrorCode.ErrDeserializeError, errorMessage(error));
		}
	}
}
