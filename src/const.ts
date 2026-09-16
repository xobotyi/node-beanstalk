import {type IClientCtorOptions, type IPoolCtorOptions} from './types.js';
import {JsonSerializer} from './serializer/json-serializer.js';

export const CRLF = '\r\n';
export const CRLF_BUFF = Buffer.from(CRLF);

export const PRIORITY_MIN = 0;
export const PRIORITY_MAX = 2 ** 32 - 1;

export const DELAY_MIN = 0;
export const DELAY_MAX = 2 ** 32 - 1;

export const TTR_MIN = 0;
export const TTR_MAX = 2 ** 32 - 1;

export const TIMEOUT_MIN = 0;
// constraint: beanstalkd reads the reserve timeout as uint32 and answers BAD_FORMAT above INT_MAX
export const TIMEOUT_MAX = 2 ** 31 - 1;

export const JOB_ID_MIN = 1;

export const BOUND_MIN = 0;
export const BOUND_MAX = 2 ** 32 - 1;

export const DEFAULT_CLIENT_OPTIONS: Required<IClientCtorOptions> = {
	host: '127.0.0.1',
	port: 11_300,
	defaultPriority: 1024,
	defaultDelay: 0,
	defaultTTR: 30,
	serializer: new JsonSerializer(),
	maxPayloadSize: 65_536,
	dataReadTimeoutMs: 1000,
};

export const DEFAULT_POOL_OPTIONS: Required<IPoolCtorOptions> = {
	clientOptions: {},
	capacity: 10,
};
