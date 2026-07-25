import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../../app/middleware/authenticate.js';
import { requireTrustedOrigin } from '../../app/middleware/origin-check.js';
import { validate } from '../../app/middleware/validate.js';
import { createRegistrationRateLimit } from '../../app/middleware/rate-limit.js';
import type { Env } from '../../config/env.js';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';
import { JwtService } from '../../shared/security/jwt.js';
import { UserRepository } from '../users/repository.js';
import { AuthController, readCookie, sessionMetadata } from './controller.js';
import { AuthRepository } from './repository.js';
import { loginSchema, registerSchema } from './schemas.js';
import { AuthService } from './service.js';
import { executeMutation } from '../../shared/mutations/executor.js';
import { mutationContext } from '../../shared/mutations/http.js';
import { AppError } from '../../shared/errors/app-error.js';

export function createAuthModule(database: DatabaseClient, env: Env) {
  const users = new UserRepository(database);
  const sessions = new AuthRepository(database);
  const jwt = new JwtService(env);
  const service = new AuthService(users, sessions, jwt, env);
  const controller = new AuthController(service, env);
  const router = Router();
  const origin = requireTrustedOrigin(env);

  router.post(
    '/register',
    createRegistrationRateLimit(),
    validate('body', registerSchema),
    async (request, response) => {
      let refreshToken: string | undefined;
      const result = await executeMutation(
        database,
        mutationContext(request, null, '/api/v1/auth/register', true),
        async (transaction) => {
          const transactionalService = new AuthService(
            new UserRepository(transaction),
            new AuthRepository(transaction),
            jwt,
            env,
          );
          const issued = await transactionalService.register(
            request.body as never,
            sessionMetadata(request),
          );
          refreshToken = issued.refreshToken;
          return {
            status: 201,
            body: { data: { user: issued.user, accessToken: issued.accessToken } },
            audit: {
              actorUserId: issued.user.id,
              action: 'USER_REGISTERED',
              entityType: 'USER',
              entityId: issued.user.id,
            },
          };
        },
      );
      if (refreshToken !== undefined) controller.setCookie(response, refreshToken);
      response.setHeader('Idempotency-Replayed', result.replayed ? 'true' : 'false');
      response.status(result.status).json(result.body);
    },
  );
  router.post('/login', validate('body', loginSchema), async (request, response) => {
    let refreshToken: string | undefined;
    const result = await executeMutation(
      database,
      mutationContext(request, null, '/api/v1/auth/login'),
      async (transaction) => {
        const issued = await new AuthService(
          new UserRepository(transaction),
          new AuthRepository(transaction),
          jwt,
          env,
        ).login(request.body as never, sessionMetadata(request));
        refreshToken = issued.refreshToken;
        return {
          status: 200,
          body: { data: { user: issued.user, accessToken: issued.accessToken } },
          audit: {
            actorUserId: issued.user.id,
            action: 'AUTH_LOGIN',
            entityType: 'AUTH_SESSION',
          },
        };
      },
    );
    if (refreshToken !== undefined) controller.setCookie(response, refreshToken);
    response.status(result.status).json(result.body);
  });
  router.post('/refresh', origin, async (request, response) => {
    let replacementToken: string | undefined;
    const result = await executeMutation(
      database,
      mutationContext(request, null, '/api/v1/auth/refresh'),
      async (transaction) => {
        const refreshed = await new AuthService(
          new UserRepository(transaction),
          new AuthRepository(transaction),
          jwt,
          env,
        ).refresh(readCookie(request, env.REFRESH_COOKIE_NAME), sessionMetadata(request));
        if (refreshed.reused) {
          return {
            status: 401,
            body: null,
            audit: {
              actorUserId: refreshed.userId,
              action: 'AUTH_REFRESH_TOKEN_REUSED',
              entityType: 'AUTH_SESSION',
            },
          };
        }
        replacementToken = refreshed.refreshToken;
        return {
          status: 200,
          body: { data: { accessToken: refreshed.accessToken } },
          audit: {
            actorUserId: refreshed.userId,
            action: 'AUTH_SESSION_REFRESHED',
            entityType: 'AUTH_SESSION',
          },
        };
      },
    );
    if (result.status === 401) {
      throw new AppError(
        401,
        'REFRESH_TOKEN_REUSED',
        'Authentication required',
        'The session family has been revoked.',
      );
    }
    if (replacementToken !== undefined) controller.setCookie(response, replacementToken);
    response.status(result.status).json(result.body);
  });
  router.post('/logout', origin, optionalAuthenticate(jwt, sessions), async (request, response) => {
    try {
      const actorUserId = request.auth?.userId ?? null;
      await executeMutation(
        database,
        mutationContext(request, actorUserId, '/api/v1/auth/logout'),
        async (transaction) => {
          const revokedUserId = await new AuthService(
            new UserRepository(transaction),
            new AuthRepository(transaction),
            jwt,
            env,
          ).logout(readCookie(request, env.REFRESH_COOKIE_NAME), request.auth?.sessionId);
          return {
            status: 204,
            body: null,
            audit: {
              ...(revokedUserId === null ? {} : { actorUserId: revokedUserId }),
              action: 'AUTH_LOGOUT',
              entityType: 'AUTH_SESSION',
            },
          };
        },
      );
    } finally {
      controller.clearCookie(response);
    }
    response.status(204).send();
  });
  router.post('/logout-all', authenticate(jwt, sessions), async (request, response) => {
    if (request.auth === undefined) throw new Error('Authentication middleware invariant failed');
    const userId = request.auth.userId;
    await executeMutation(
      database,
      mutationContext(request, userId, '/api/v1/auth/logout-all'),
      async (transaction) => {
        await new AuthService(
          new UserRepository(transaction),
          new AuthRepository(transaction),
          jwt,
          env,
        ).logoutAll(userId);
        return {
          status: 204,
          body: null,
          audit: { action: 'AUTH_LOGOUT_ALL', entityType: 'USER', entityId: userId },
        };
      },
    );
    controller.clearCookie(response);
    response.status(204).send();
  });
  return { router, authenticate: authenticate(jwt, sessions) };
}
