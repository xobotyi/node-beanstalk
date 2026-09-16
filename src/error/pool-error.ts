import {ErrorWithCode} from './error-with-code.js';

export const PoolErrorCode = {
	ErrNotLive: 'ErrNotLive',
	ErrDisconnecting: 'ErrDisconnecting',
	ErrNotDisconnected: 'ErrNotDisconnected',
	ErrClientTimeout: 'ErrClientTimeout',
	ErrClientConnect: 'ErrClientConnect',
} as const satisfies Record<string, string>;
export type PoolErrorCode = (typeof PoolErrorCode)[keyof typeof PoolErrorCode];

export class PoolError extends ErrorWithCode<PoolErrorCode> {
	name = 'PoolError';
}
