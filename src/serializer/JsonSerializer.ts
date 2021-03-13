/* eslint-disable class-methods-use-this */
import { Serializer } from '../types';

export class JsonSerializer extends Serializer {
  public serialize(data: any): string {
    return JSON.stringify(data);
  }

  public deserialize(text: string): any {
    return JSON.parse(text);
  }
}
