import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../errors/app-error.js';
import { sha256 } from '../security/hash.js';
export interface CursorPayload {
  filterHash: string;
  sort: string;
  order: 'asc' | 'desc';
  value: string | null;
  id: string;
}
export const filterHash = (filters: unknown): string => sha256(JSON.stringify(filters));
export function encodeCursor(payload: CursorPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}
export function decodeCursor(
  value: string,
  secret: string,
  expectedFilterHash: string,
): CursorPayload {
  try {
    const [body, signature] = value.split('.');
    if (body === undefined || signature === undefined) throw new Error();
    const expected = createHmac('sha256', secret).update(body).digest();
    const actual = Buffer.from(signature, 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error();
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString()) as CursorPayload;
    if (parsed.filterHash !== expectedFilterHash) throw new Error();
    return parsed;
  } catch {
    throw new AppError(
      422,
      'INVALID_CURSOR',
      'Request validation failed',
      'The pagination cursor is invalid for this query.',
    );
  }
}
