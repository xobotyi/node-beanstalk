import { Pool } from '../src';

describe('Pool', () => {
  it('should be defined', () => {
    expect(Pool).toBeDefined();
    // eslint-disable-next-line no-new
    new Pool();
  });
});
