import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../../app/middleware/authenticate.js';
import { requireTrustedOrigin } from '../../app/middleware/origin-check.js';
import { validate } from '../../app/middleware/validate.js';
import { registrationRateLimit } from '../../app/middleware/rate-limit.js';
import type { Env } from '../../config/env.js';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';
import { JwtService } from '../../shared/security/jwt.js';
import { UserRepository } from '../users/repository.js';
import { AuthController } from './controller.js';
import { AuthRepository } from './repository.js';
import { loginSchema, registerSchema } from './schemas.js';
import { AuthService } from './service.js';

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
    registrationRateLimit,
    validate('body', registerSchema),
    controller.register,
  );
  router.post('/login', validate('body', loginSchema), controller.login);
  router.post('/refresh', origin, controller.refresh);
  router.post('/logout', origin, optionalAuthenticate(jwt, sessions), controller.logout);
  router.post('/logout-all', authenticate(jwt, sessions), controller.logoutAll);
  return { router, authenticate: authenticate(jwt, sessions) };
}
