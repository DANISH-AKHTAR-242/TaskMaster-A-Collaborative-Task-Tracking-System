import { Router, type RequestHandler } from 'express';
import { validate } from '../../app/middleware/validate.js';
import type { Env } from '../../config/env.js';
import type { DatabaseClient, DatabaseHandle } from '../../infrastructure/database/prisma.js';
import { mutationHandler } from '../../shared/mutations/handler.js';
import { ProjectRepository } from '../projects/repository.js';
import { authUserId, stringParam } from '../../shared/utilities/http.js';
import { uuidParams } from '../../shared/validation/common.js';
import { TaskRepository } from './repository.js';
import { createTaskSchema, taskQuerySchema, updateTaskSchema } from './schemas.js';
import { TaskService } from './service.js';
export function taskRoutes(db: DatabaseClient, env: Env, auth: RequestHandler) {
  const projects = Router(),
    tasks = Router(),
    service = (handle: DatabaseHandle) => new TaskService(new TaskRepository(handle), env),
    s = service(db);
  projects.use(auth);
  tasks.use(auth);
  projects.post(
    '/:projectId/tasks',
    validate('params', uuidParams('projectId')),
    validate('body', createTaskSchema),
    mutationHandler(
      db,
      '/api/v1/projects/{projectId}/tasks',
      async (request, transaction) => {
        const projectId = stringParam(request, 'projectId');
        const task = await service(transaction).create(
          projectId,
          authUserId(request),
          request.body as never,
        );
        const project = await new ProjectRepository(transaction).find(projectId);
        return {
          status: 201,
          body: { data: task },
          audit: {
            action: 'TASK_CREATED',
            entityType: 'TASK',
            entityId: task.id,
            ...(project === null ? {} : { teamId: project.teamId }),
            metadata: { projectId },
          },
        };
      },
      { idempotent: true },
    ),
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
    mutationHandler(db, '/api/v1/tasks/{taskId}', async (request, transaction) => {
      const taskId = stringParam(request, 'taskId');
      const task = await service(transaction).update(
        taskId,
        authUserId(request),
        request.body as never,
      );
      const project = await new ProjectRepository(transaction).find(task.projectId);
      return {
        status: 200,
        body: { data: task },
        audit: {
          action: task.status === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_UPDATED',
          entityType: 'TASK',
          entityId: taskId,
          ...(project === null ? {} : { teamId: project.teamId }),
          metadata: { projectId: task.projectId, version: task.version },
        },
      };
    }),
  );
  tasks.delete(
    '/:taskId',
    validate('params', uuidParams('taskId')),
    mutationHandler(db, '/api/v1/tasks/{taskId}', async (request, transaction) => {
      const taskId = stringParam(request, 'taskId');
      const task = await service(transaction).remove(taskId, authUserId(request));
      const project = await new ProjectRepository(transaction).find(task.projectId);
      return {
        status: 204,
        body: null,
        audit: {
          action: 'TASK_DELETED',
          entityType: 'TASK',
          entityId: taskId,
          ...(project === null ? {} : { teamId: project.teamId }),
          metadata: { projectId: task.projectId },
        },
      };
    }),
  );
  tasks.post(
    '/:taskId/restore',
    validate('params', uuidParams('taskId')),
    mutationHandler(db, '/api/v1/tasks/{taskId}/restore', async (request, transaction) => {
      const taskId = stringParam(request, 'taskId');
      const task = await service(transaction).restore(taskId, authUserId(request));
      const project = await new ProjectRepository(transaction).find(task.projectId);
      return {
        status: 200,
        body: { data: task },
        audit: {
          action: 'TASK_RESTORED',
          entityType: 'TASK',
          entityId: taskId,
          ...(project === null ? {} : { teamId: project.teamId }),
          metadata: { projectId: task.projectId },
        },
      };
    }),
  );
  return { projects, tasks };
}
