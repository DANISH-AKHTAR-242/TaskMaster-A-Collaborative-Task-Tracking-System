import argon2 from 'argon2';

export async function hashPassword(password: string, pepper: string): Promise<string> {
  return argon2.hash(`${password}${pepper}`, { type: argon2.argon2id });
}

export async function verifyPassword(
  hash: string,
  password: string,
  pepper: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, `${password}${pepper}`);
  } catch {
    return false;
  }
}
