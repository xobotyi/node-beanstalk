import { ErrorWithCode } from './ErrorWithCode';

export enum SerializerErrorCode {
  ErrSerializeError = 'ErrSerializeError',
  ErrDeserializeError = 'ErrDeserializeError',
}

export class SerializerError extends ErrorWithCode<SerializerErrorCode> {}
