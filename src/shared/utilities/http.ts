import type { Request } from 'express';
import { unauthorized } from '../errors/app-error.js';

export function authUserId(request: Request): string {
  if (request.auth === undefined) throw unauthorized();
  return request.auth.userId;
}

export function stringParam(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== 'string') throw new Error(`Validated parameter ${name} is missing`);
  return value;
}
