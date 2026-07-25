import { Router, type RequestHandler } from 'express';
import { validate } from '../../app/middleware/validate.js';
import type { DatabaseClient, DatabaseHandle } from '../../infrastructure/database/prisma.js';
import { mutationHandler } from '../../shared/mutations/handler.js';
import { authUserId, stringParam } from '../../shared/utilities/http.js';
import { uuidParams } from '../../shared/validation/common.js';
import { CommentRepository } from './repository.js';
import { commentBodySchema } from './schemas.js';
import { CommentService } from './service.js';
export function commentRoutes(db: DatabaseClient, auth: RequestHandler) {
  const tasks = Router(),
    comments = Router(),
    service = (handle: DatabaseHandle) => new CommentService(new CommentRepository(handle)),
    s = service(db);
  tasks.use(auth);
  comments.use(auth);
  tasks.post(
    '/:taskId/comments',
    validate('params', uuidParams('taskId')),
    validate('body', commentBodySchema),
    mutationHandler(db, '/api/v1/tasks/{taskId}/comments', async (request, transaction) => {
      const taskId = stringParam(request, 'taskId');
      const comment = await service(transaction).create(
        taskId,
        authUserId(request),
        (request.body as { body: string }).body,
      );
      return {
        status: 201,
        body: { data: comment },
        audit: {
          action: 'TASK_COMMENT_ADDED',
          entityType: 'TASK_COMMENT',
          entityId: comment.id,
          metadata: { taskId },
        },
      };
    }),
  );
  tasks.get('/:taskId/comments', validate('params', uuidParams('taskId')), async (q, r) =>
    r.json({ data: await s.list(stringParam(q, 'taskId'), authUserId(q)) }),
  );
  comments.patch(
    '/:commentId',
    validate('params', uuidParams('commentId')),
    validate('body', commentBodySchema),
    mutationHandler(db, '/api/v1/comments/{commentId}', async (request, transaction) => {
      const commentId = stringParam(request, 'commentId');
      const comment = await service(transaction).update(
        commentId,
        authUserId(request),
        (request.body as { body: string }).body,
      );
      return {
        status: 200,
        body: { data: comment },
        audit: {
          action: 'TASK_COMMENT_UPDATED',
          entityType: 'TASK_COMMENT',
          entityId: commentId,
          metadata: { taskId: comment.taskId },
        },
      };
    }),
  );
  comments.delete(
    '/:commentId',
    validate('params', uuidParams('commentId')),
    mutationHandler(db, '/api/v1/comments/{commentId}', async (request, transaction) => {
      const commentId = stringParam(request, 'commentId');
      const comment = await service(transaction).remove(commentId, authUserId(request));
      return {
        status: 204,
        body: null,
        audit: {
          action: 'TASK_COMMENT_DELETED',
          entityType: 'TASK_COMMENT',
          entityId: commentId,
          metadata: { taskId: comment.taskId },
        },
      };
    }),
  );
  return { tasks, comments };
}
