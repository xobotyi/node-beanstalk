/* eslint-disable class-methods-use-this */
import { Serializer } from '../types';

export class JsonSerializer extends Serializer {
  public serialize(data: any): Buffer {
    return Buffer.from(JSON.stringify(data), 'utf-8');
  }

  public deserialize(buffer: Buffer): any {
    return JSON.parse(buffer.toString('utf-8'));
  }
}
