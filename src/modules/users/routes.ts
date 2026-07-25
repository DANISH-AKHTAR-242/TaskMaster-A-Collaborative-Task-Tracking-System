import { Router, type RequestHandler } from 'express';
import { validate } from '../../app/middleware/validate.js';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';
import { mutationHandler } from '../../shared/mutations/handler.js';
import { authUserId } from '../../shared/utilities/http.js';
import { UserController } from './controller.js';
import { UserRepository } from './repository.js';
import { updateProfileSchema } from './schemas.js';
import { UserService } from './service.js';

export function userRoutes(database: DatabaseClient, authenticateUser: RequestHandler): Router {
  const router = Router();
  const controller = new UserController(new UserService(new UserRepository(database)));
  router.use(authenticateUser);
  router.get('/me', controller.me);
  router.patch(
    '/me',
    validate('body', updateProfileSchema),
    mutationHandler(database, '/api/v1/users/me', async (request, transaction) => {
      const userId = authUserId(request);
      const user = await new UserService(new UserRepository(transaction)).update(
        userId,
        request.body as never,
      );
      return {
        status: 200,
        body: { data: user },
        audit: { action: 'USER_PROFILE_UPDATED', entityType: 'USER', entityId: userId },
      };
    }),
  );
  return router;
}
