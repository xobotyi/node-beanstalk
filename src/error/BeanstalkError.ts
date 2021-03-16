export class BeanstalkError extends Error {
  name = 'BeanstalkError';

  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);

    this.code = code;
  }
}
