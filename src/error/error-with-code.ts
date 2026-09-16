export class ErrorWithCode<Code extends string = string> extends Error {
	public readonly code: Code;

	constructor(code: Code, msg: string, options?: ErrorOptions) {
		super(msg, options);

		this.code = code;
	}
}
