import {load} from 'js-yaml';
import {CommandError, CommandErrorCode} from './error/command-error.js';
import {CRLF_BUFF} from './const.js';
import {
	CommandName,
	ErrorResponseStatus,
	ResponseStatus,
	type CommandHandledResponse,
	type CommandResponse,
	type Serializer,
} from './types.js';

export type CommandOptions<R extends ResponseStatus = ResponseStatus> = {
	payloadBody?: boolean;
	yamlBody?: boolean;
	expectedStatus?: readonly R[];
};

export class Command<R extends ResponseStatus = ResponseStatus> {
	private readonly commandName: CommandName;

	private readonly opt: Required<CommandOptions<R>>;

	constructor(commandName: CommandName, opt: CommandOptions<R> = {}) {
		if (!CommandName[commandName]) {
			throw new CommandError(CommandErrorCode.ErrCommandUnknown, `Unknown beanstalk command '${commandName}'`);
		}

		this.opt = {
			payloadBody: opt.payloadBody ?? false,
			yamlBody: opt.yamlBody ?? false,
			expectedStatus: (opt.expectedStatus ?? []).map((status) => {
				if (!ResponseStatus[status])
					throw new CommandError(
						CommandErrorCode.ErrResponseStatusUnknown,
						`Unknown beanstalk response status expected '${commandName}'`,
					);

				return status;
			}),
		};

		this.commandName = commandName;
	}

	/**
	 * Build command as buffer
	 *
	 * @private
	 */
	public buildCommandBuffer(args: string[] = [], payload?: Buffer): Buffer {
		const parts = [this.commandName, ...args];

		if (payload) {
			parts.push(`${payload.length}`);
			return Buffer.concat([Buffer.from(parts.join(' ')), CRLF_BUFF, payload, CRLF_BUFF]);
		}

		return Buffer.concat([Buffer.from(parts.join(' ')), CRLF_BUFF]);
	}

	public handleResponse(response: CommandResponse, serializer?: Serializer): CommandHandledResponse<R> {
		if (ErrorResponseStatus[response.status as ErrorResponseStatus]) {
			throw new CommandError(
				CommandErrorCode.ErrErrorResponseStatus,
				`Error status '${response.status}' received in response to '${this.commandName}' command`,
			);
		}

		if (!this.opt.expectedStatus.includes(response.status as R)) {
			throw new CommandError(
				CommandErrorCode.ErrUnexpectedResponseStatus,
				`Unexpected status '${response.status}' received in response to '${this.commandName}' command`,
			);
		}

		const res: {status: ResponseStatus; headers: string[]; data?: unknown} = {
			status: response.status,
			headers: response.headers,
		};

		if (response.data) {
			const data = response.data.subarray(0, response.data.length - CRLF_BUFF.length);
			res.data = data;

			if (this.opt.payloadBody) {
				if (serializer) {
					res.data = serializer.deserialize(data);
				}
			} else if (this.opt.yamlBody) {
				res.data = load(data.toString());
			}
		}

		return res as CommandHandledResponse<R>;
	}
}
