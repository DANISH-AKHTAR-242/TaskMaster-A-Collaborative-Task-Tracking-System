import { assertIdempotentReplay, normalizedRequestHash } from './request.js';
describe('idempotency request binding', () => {
  it('normalizes object key order and rejects changed payloads', () => {
    const hash = normalizedRequestHash({ a: 1, b: 2 });
    expect(normalizedRequestHash({ b: 2, a: 1 })).toBe(hash);
    expect(() => {
      assertIdempotentReplay(hash, { a: 2, b: 2 });
    }).toThrow();
  });
});
