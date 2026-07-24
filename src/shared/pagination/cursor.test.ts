import { decodeCursor, encodeCursor, filterHash } from './cursor.js';
describe('signed cursors', () => {
  it('binds a cursor to filters', () => {
    const hash = filterHash({ status: 'OPEN' });
    const token = encodeCursor(
      { filterHash: hash, sort: 'createdAt', order: 'desc', value: 'x', id: crypto.randomUUID() },
      'a'.repeat(32),
    );
    expect(decodeCursor(token, 'a'.repeat(32), hash).filterHash).toBe(hash);
    expect(() =>
      decodeCursor(token, 'a'.repeat(32), filterHash({ status: 'COMPLETED' })),
    ).toThrow();
  });
});
