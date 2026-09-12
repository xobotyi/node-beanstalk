import {Serializer} from '../types.js';
import {SerializerError, SerializerErrorCode} from '../error/serializer-error.js';

export class JsonSerializer extends Serializer {
	public serialize(data: any): Buffer {
		try {
			return Buffer.from(JSON.stringify(data), 'utf8');
		} catch (error: unknown) {
			throw new SerializerError(SerializerErrorCode.ErrSerializeError, (error as Error).message);
		}
	}

	public deserialize(buffer: Buffer): any {
		try {
			return JSON.parse(buffer.toString('utf8'));
		} catch (error: unknown) {
			throw new SerializerError(SerializerErrorCode.ErrDeserializeError, (error as Error).message);
		}
	}
}
