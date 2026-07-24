import { normalizeEmail, randomOpaqueToken, sha256 } from './hash.js';

describe('token helpers', () => {
  it('normalizes email and hashes refresh tokens deterministically', () => {
    expect(normalizeEmail(' Alex@Example.COM ')).toBe('alex@example.com');
    expect(sha256('secret')).toHaveLength(64);
    expect(randomOpaqueToken()).not.toBe(randomOpaqueToken());
  });
});
