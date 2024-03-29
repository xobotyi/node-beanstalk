import { JsonSerializer } from '../../src/serializer/JsonSerializer';
import { SerializerError } from '../../src';
import { SerializerErrorCode } from '../../src/error/SerializerError';

describe('JsonSerializer', () => {
  it('should be defined', () => {
    expect(JsonSerializer).toBeDefined();
  });

  it('should be constructable via new', () => {
    expect(new JsonSerializer()).toBeInstanceOf(JsonSerializer);
  });

  it('should have serialize and deserialize methods ', () => {
    const s = new JsonSerializer();
    expect(s.serialize).toBeInstanceOf(Function);
    expect(s.deserialize).toBeInstanceOf(Function);
  });

  describe('JsonSerializer.serialize', () => {
    const tableTests = [
      {
        name: 'string',
        in: 'node-beanstalk',
        out: Buffer.from(JSON.stringify('node-beanstalk')),
      },
      {
        name: 'array',
        in: ['a', 'b', 1, 2],
        out: Buffer.from(JSON.stringify(['a', 'b', 1, 2])),
      },
      {
        name: 'object',
        in: { foo: 'bar', baz: 123 },
        out: Buffer.from(JSON.stringify({ foo: 'bar', baz: 123 })),
      },
    ];

    const s = new JsonSerializer();

    // eslint-disable-next-line no-restricted-syntax
    for (const test of tableTests) {
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      it(test.name, () => {
        expect(s.serialize(test.in)).toStrictEqual(test.out);
      });
    }

    const obj: any = {};
    obj.a = obj;

    it('should throw on encode error', () => {
      try {
        s.serialize(obj);
        throw new Error('not thrown!');
      } catch (e: any) {
        expect(e).toBeInstanceOf(SerializerError);
        expect(e.code).toBe(SerializerErrorCode.ErrSerializeError);
      }
    });
  });

  describe('JsonSerializer.deserialize', () => {
    const tableTests = [
      {
        name: 'string',
        in: Buffer.from(JSON.stringify('node-beanstalk')),
        out: 'node-beanstalk',
      },
      {
        name: 'array',
        in: Buffer.from(JSON.stringify(['a', 'b', 1, 2])),
        out: ['a', 'b', 1, 2],
      },
      {
        name: 'object',
        in: Buffer.from(JSON.stringify({ foo: 'bar', baz: 123 })),
        out: { foo: 'bar', baz: 123 },
      },
    ];

    const s = new JsonSerializer();

    // eslint-disable-next-line no-restricted-syntax
    for (const test of tableTests) {
      // eslint-disable-next-line @typescript-eslint/no-loop-func
      it(test.name, () => {
        expect(s.deserialize(test.in)).toStrictEqual(test.out);
      });
    }

    it('should throw on decode error', () => {
      try {
        s.deserialize(Buffer.from('{"invalid json'));
        throw new Error('not thrown!');
      } catch (e: any) {
        expect(e).toBeInstanceOf(SerializerError);
        expect(e.code).toBe(SerializerErrorCode.ErrDeserializeError);
      }
    });
  });
});
