import { hashPassword, verifyPassword } from './password.js';

describe('password security', () => {
  it('hashes with argon2id and verifies using the pepper', async () => {
    const hash = await hashPassword('correct-horse-battery-staple', 'pepper');
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(verifyPassword(hash, 'correct-horse-battery-staple', 'pepper')).resolves.toBe(
      true,
    );
    await expect(verifyPassword(hash, 'wrong-password', 'pepper')).resolves.toBe(false);
  });
});
