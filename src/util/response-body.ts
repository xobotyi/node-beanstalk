import {type CommandName} from '../types.js';
import {ResponseError, ResponseErrorCode} from '../error/response-error.js';

function describeBody(body: unknown): string {
	if (body === null) return 'null';
	if (Array.isArray(body)) return 'a list';

	return typeof body;
}

/**
 * Narrows the YAML body of a response to the map the protocol states for {command}. Any other body throws a
 * ResponseError of code `ErrUnexpectedBody`.
 */
export function requireMapBody(body: unknown, command: CommandName): Record<string, unknown> {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		throw new ResponseError(
			ResponseErrorCode.ErrUnexpectedBody,
			`Expected a YAML map in response to '${command}', got ${describeBody(body)}`,
		);
	}

	return body as Record<string, unknown>;
}

/**
 * Narrows the YAML body of a response to the list of strings the protocol states for {command}. Any other body throws
 * a ResponseError of code `ErrUnexpectedBody`.
 */
export function requireStringListBody(body: unknown, command: CommandName): string[] {
	if (!Array.isArray(body) || body.some((item) => typeof item !== 'string')) {
		throw new ResponseError(
			ResponseErrorCode.ErrUnexpectedBody,
			`Expected a YAML list of strings in response to '${command}', got ${describeBody(body)}`,
		);
	}

	return body as string[];
}
