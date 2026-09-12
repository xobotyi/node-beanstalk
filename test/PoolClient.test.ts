import {describe, expect, it} from 'vite-plus/test';
import {PoolClient} from '../src/PoolClient';

describe('PoolClient', () => {
	describe('releaseClient', () => {
		it('should emit `release` event on client', async () => {
			const c = new PoolClient();
			const released = new Promise((resolve) => c.once('release', resolve));

			c.releaseClient();

			await expect(released).resolves.toBe(c);
		});
	});
});
