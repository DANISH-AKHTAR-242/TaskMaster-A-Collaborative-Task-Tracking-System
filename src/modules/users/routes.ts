import { Router, type RequestHandler } from 'express';
import { validate } from '../../app/middleware/validate.js';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';
import { UserController } from './controller.js';
import { UserRepository } from './repository.js';
import { updateProfileSchema } from './schemas.js';
import { UserService } from './service.js';

export function userRoutes(database: DatabaseClient, authenticateUser: RequestHandler): Router {
  const router = Router();
  const controller = new UserController(new UserService(new UserRepository(database)));
  router.use(authenticateUser);
  router.get('/me', controller.me);
  router.patch('/me', validate('body', updateProfileSchema), controller.update);
  return router;
}
