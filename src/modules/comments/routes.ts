import { Router, type RequestHandler } from 'express';
import { validate } from '../../app/middleware/validate.js';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';
import { authUserId, stringParam } from '../../shared/utilities/http.js';
import { uuidParams } from '../../shared/validation/common.js';
import { CommentRepository } from './repository.js';
import { commentBodySchema } from './schemas.js';
import { CommentService } from './service.js';
export function commentRoutes(db: DatabaseClient, auth: RequestHandler) {
  const tasks = Router(),
    comments = Router(),
    s = new CommentService(new CommentRepository(db));
  tasks.use(auth);
  comments.use(auth);
  tasks.post(
    '/:taskId/comments',
    validate('params', uuidParams('taskId')),
    validate('body', commentBodySchema),
    async (q, r) =>
      r.status(201).json({
        data: await s.create(
          stringParam(q, 'taskId'),
          authUserId(q),
          (q.body as { body: string }).body,
        ),
      }),
  );
  tasks.get('/:taskId/comments', validate('params', uuidParams('taskId')), async (q, r) =>
    r.json({ data: await s.list(stringParam(q, 'taskId'), authUserId(q)) }),
  );
  comments.patch(
    '/:commentId',
    validate('params', uuidParams('commentId')),
    validate('body', commentBodySchema),
    async (q, r) =>
      r.json({
        data: await s.update(
          stringParam(q, 'commentId'),
          authUserId(q),
          (q.body as { body: string }).body,
        ),
      }),
  );
  comments.delete('/:commentId', validate('params', uuidParams('commentId')), async (q, r) => {
    await s.remove(stringParam(q, 'commentId'), authUserId(q));
    r.status(204).send();
  });
  return { tasks, comments };
}
