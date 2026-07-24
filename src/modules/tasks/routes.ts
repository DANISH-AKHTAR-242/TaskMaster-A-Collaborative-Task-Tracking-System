import { Router, type RequestHandler } from 'express';
import { validate } from '../../app/middleware/validate.js';
import type { Env } from '../../config/env.js';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';
import { authUserId, stringParam } from '../../shared/utilities/http.js';
import { uuidParams } from '../../shared/validation/common.js';
import { TaskRepository } from './repository.js';
import { createTaskSchema, taskQuerySchema, updateTaskSchema } from './schemas.js';
import { TaskService } from './service.js';
export function taskRoutes(db: DatabaseClient, env: Env, auth: RequestHandler) {
  const projects = Router(),
    tasks = Router(),
    s = new TaskService(new TaskRepository(db), env);
  projects.use(auth);
  tasks.use(auth);
  projects.post(
    '/:projectId/tasks',
    validate('params', uuidParams('projectId')),
    validate('body', createTaskSchema),
    async (q, r) =>
      r.status(201).json({
        data: await s.create(stringParam(q, 'projectId'), authUserId(q), q.body as never),
      }),
  );
  projects.get(
    '/:projectId/tasks',
    validate('params', uuidParams('projectId')),
    validate('query', taskQuerySchema),
    async (q, r) =>
      r.json(await s.list(stringParam(q, 'projectId'), authUserId(q), q.query as never)),
  );
  tasks.get('/', validate('query', taskQuerySchema), async (q, r) =>
    r.json(await s.list(undefined, authUserId(q), q.query as never)),
  );
  tasks.get('/:taskId', validate('params', uuidParams('taskId')), async (q, r) =>
    r.json({ data: await s.get(stringParam(q, 'taskId'), authUserId(q)) }),
  );
  tasks.patch(
    '/:taskId',
    validate('params', uuidParams('taskId')),
    validate('body', updateTaskSchema),
    async (q, r) =>
      r.json({ data: await s.update(stringParam(q, 'taskId'), authUserId(q), q.body as never) }),
  );
  tasks.delete('/:taskId', validate('params', uuidParams('taskId')), async (q, r) => {
    await s.remove(stringParam(q, 'taskId'), authUserId(q));
    r.status(204).send();
  });
  tasks.post('/:taskId/restore', validate('params', uuidParams('taskId')), async (q, r) =>
    r.json({ data: await s.restore(stringParam(q, 'taskId'), authUserId(q)) }),
  );
  return { projects, tasks };
}
