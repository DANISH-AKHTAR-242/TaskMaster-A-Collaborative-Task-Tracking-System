import type { RequestHandler } from 'express';
import type { AuthRepository } from '../../modules/auth/repository.js';
import { unauthorized } from '../../shared/errors/app-error.js';
import type { JwtService } from '../../shared/security/jwt.js';

function bearerToken(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return /^Bearer ([^\s]+)$/i.exec(value)?.[1];
}

export function authenticate(jwt: JwtService, sessions: AuthRepository): RequestHandler {
  return async (request, _response, next) => {
    const token = bearerToken(request.header('authorization'));
    if (token === undefined) throw unauthorized();
    const claims = await jwt.verify(token);
    if ((await sessions.findActiveSession(claims.sessionId, claims.userId)) === null)
      throw unauthorized();
    request.auth = claims;
    next();
  };
}

export function optionalAuthenticate(jwt: JwtService, sessions: AuthRepository): RequestHandler {
  return async (request, _response, next) => {
    const token = bearerToken(request.header('authorization'));
    if (token === undefined) {
      next();
      return;
    }
    const claims = await jwt.verify(token);
    if ((await sessions.findActiveSession(claims.sessionId, claims.userId)) === null)
      throw unauthorized();
    request.auth = claims;
    next();
  };
}
