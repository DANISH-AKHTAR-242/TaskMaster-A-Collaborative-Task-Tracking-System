import { Router, type RequestHandler } from 'express';
import { validate } from '../../app/middleware/validate.js';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';
import { authUserId, stringParam } from '../../shared/utilities/http.js';
import { uuidParams } from '../../shared/validation/common.js';
import { ProjectRepository } from './repository.js';
import {
  addProjectMemberSchema,
  createProjectSchema,
  updateProjectMemberSchema,
  updateProjectSchema,
} from './schemas.js';
import { ProjectService } from './service.js';
export function projectRoutes(db: DatabaseClient, auth: RequestHandler) {
  const teams = Router();
  const projects = Router();
  const s = new ProjectService(new ProjectRepository(db));
  teams.use(auth);
  projects.use(auth);
  teams.post(
    '/:teamId/projects',
    validate('params', uuidParams('teamId')),
    validate('body', createProjectSchema),
    async (q, r) =>
      r
        .status(201)
        .json({ data: await s.create(stringParam(q, 'teamId'), authUserId(q), q.body as never) }),
  );
  teams.get('/:teamId/projects', validate('params', uuidParams('teamId')), async (q, r) =>
    r.json({ data: await s.list(stringParam(q, 'teamId'), authUserId(q)) }),
  );
  projects.get('/:projectId', validate('params', uuidParams('projectId')), async (q, r) =>
    r.json({ data: await s.get(stringParam(q, 'projectId'), authUserId(q)) }),
  );
  projects.patch(
    '/:projectId',
    validate('params', uuidParams('projectId')),
    validate('body', updateProjectSchema),
    async (q, r) =>
      r.json({ data: await s.update(stringParam(q, 'projectId'), authUserId(q), q.body as never) }),
  );
  projects.delete('/:projectId', validate('params', uuidParams('projectId')), async (q, r) => {
    await s.remove(stringParam(q, 'projectId'), authUserId(q));
    r.status(204).send();
  });
  projects.post('/:projectId/restore', validate('params', uuidParams('projectId')), async (q, r) =>
    r.json({ data: await s.restore(stringParam(q, 'projectId'), authUserId(q)) }),
  );
  projects.get('/:projectId/members', validate('params', uuidParams('projectId')), async (q, r) =>
    r.json({ data: await s.members(stringParam(q, 'projectId'), authUserId(q)) }),
  );
  projects.post(
    '/:projectId/members',
    validate('params', uuidParams('projectId')),
    validate('body', addProjectMemberSchema),
    async (q, r) =>
      r.status(201).json({
        data: await s.addMember(stringParam(q, 'projectId'), authUserId(q), q.body as never),
      }),
  );
  projects.patch(
    '/:projectId/members/:userId',
    validate('body', updateProjectMemberSchema),
    async (q, r) =>
      r.json({
        data: await s.updateMember(
          stringParam(q, 'projectId'),
          stringParam(q, 'userId'),
          authUserId(q),
          (q.body as { role: never }).role,
        ),
      }),
  );
  projects.delete('/:projectId/members/:userId', async (q, r) => {
    await s.removeMember(stringParam(q, 'projectId'), stringParam(q, 'userId'), authUserId(q));
    r.status(204).send();
  });
  return { teams, projects };
}
