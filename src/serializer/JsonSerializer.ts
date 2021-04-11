/* eslint-disable class-methods-use-this */
import { Serializer } from '../types';
import { SerializerError, SerializerErrorCode } from '../error/SerializerError';

export class JsonSerializer extends Serializer {
  public serialize(data: any): Buffer {
    try {
      return Buffer.from(JSON.stringify(data), 'utf-8');
    } catch (e: unknown) {
      throw new SerializerError(SerializerErrorCode.ErrSerializeError, (e as Error).message);
    }
  }

  public deserialize(buffer: Buffer): any {
    try {
      return JSON.parse(buffer.toString('utf-8'));
    } catch (e: unknown) {
      throw new SerializerError(SerializerErrorCode.ErrDeserializeError, (e as Error).message);
    }
  }
}
