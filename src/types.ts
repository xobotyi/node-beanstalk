export abstract class Serializer {
  abstract serialize(data: any): string;

  abstract deserialize(text: string): any;
}
