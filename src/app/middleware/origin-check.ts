import type { RequestHandler } from 'express';
import type { Env } from '../../config/env.js';
import { forbidden } from '../../shared/errors/app-error.js';

export function requireTrustedOrigin(
  env: Pick<Env, 'CLIENT_ORIGINS' | 'APP_BASE_URL'>,
): RequestHandler {
  const allowed = new Set([
    ...env.CLIENT_ORIGINS.split(',').map((value) => value.trim()),
    env.APP_BASE_URL,
  ]);
  return (request, _response, next) => {
    const origin = request.header('origin');
    if (origin === undefined || !allowed.has(origin)) throw forbidden();
    next();
  };
}
