import { sha256 } from '../security/hash.js';
import { conflict } from '../errors/app-error.js';
export function normalizedRequestHash(body: unknown): string {
  const normalize = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(normalize)
      : typeof value === 'object' && value !== null
        ? Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, normalize(v)]),
          )
        : value;
  return sha256(JSON.stringify(normalize(body) ?? null));
}
export function assertIdempotentReplay(storedHash: string, body: unknown): void {
  if (storedHash !== normalizedRequestHash(body))
    throw conflict(
      'IDEMPOTENCY_KEY_REUSED',
      'The idempotency key was reused with a different request.',
    );
}
