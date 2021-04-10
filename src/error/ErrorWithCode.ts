export class ErrorWithCode<Code extends string = string> extends Error {
  public readonly code: Code;

  constructor(code: Code, msg: string) {
    super(msg);

    this.code = code;
  }
}
