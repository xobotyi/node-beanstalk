import { PoolClient } from '../src/PoolClient';

describe('PoolClient', () => {
  describe('releaseClient', () => {
    it('should emit `release` event on client', (done) => {
      const c = new PoolClient();

      c.once('release', (client) => {
        expect(client).toBe(c);
        done();
      });

      c.releaseClient();
    });
  });
});
