import { Router, type RequestHandler } from 'express';
import { validate } from '../../app/middleware/validate.js';
import type { DatabaseClient, DatabaseHandle } from '../../infrastructure/database/prisma.js';
import { mutationHandler } from '../../shared/mutations/handler.js';
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
  const service = (handle: DatabaseHandle) => new ProjectService(new ProjectRepository(handle));
  const s = service(db);
  teams.use(auth);
  projects.use(auth);
  teams.post(
    '/:teamId/projects',
    validate('params', uuidParams('teamId')),
    validate('body', createProjectSchema),
    mutationHandler(
      db,
      '/api/v1/teams/{teamId}/projects',
      async (request, transaction) => {
        const teamId = stringParam(request, 'teamId');
        const project = await service(transaction).create(
          teamId,
          authUserId(request),
          request.body as never,
        );
        return {
          status: 201,
          body: { data: project },
          audit: { action: 'PROJECT_CREATED', entityType: 'PROJECT', entityId: project.id, teamId },
        };
      },
      { idempotent: true },
    ),
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
    mutationHandler(db, '/api/v1/projects/{projectId}', async (request, transaction) => {
      const projectId = stringParam(request, 'projectId');
      const project = await service(transaction).update(
        projectId,
        authUserId(request),
        request.body as never,
      );
      return {
        status: 200,
        body: { data: project },
        audit: {
          action: 'PROJECT_UPDATED',
          entityType: 'PROJECT',
          entityId: projectId,
          teamId: project.teamId,
        },
      };
    }),
  );
  projects.delete(
    '/:projectId',
    validate('params', uuidParams('projectId')),
    mutationHandler(db, '/api/v1/projects/{projectId}', async (request, transaction) => {
      const projectId = stringParam(request, 'projectId');
      const project = await service(transaction).remove(projectId, authUserId(request));
      return {
        status: 204,
        body: null,
        audit: {
          action: 'PROJECT_DELETED',
          entityType: 'PROJECT',
          entityId: projectId,
          teamId: project.teamId,
        },
      };
    }),
  );
  projects.post(
    '/:projectId/restore',
    validate('params', uuidParams('projectId')),
    mutationHandler(db, '/api/v1/projects/{projectId}/restore', async (request, transaction) => {
      const projectId = stringParam(request, 'projectId');
      const project = await service(transaction).restore(projectId, authUserId(request));
      return {
        status: 200,
        body: { data: project },
        audit: {
          action: 'PROJECT_RESTORED',
          entityType: 'PROJECT',
          entityId: projectId,
          teamId: project.teamId,
        },
      };
    }),
  );
  projects.get('/:projectId/members', validate('params', uuidParams('projectId')), async (q, r) =>
    r.json({ data: await s.members(stringParam(q, 'projectId'), authUserId(q)) }),
  );
  projects.post(
    '/:projectId/members',
    validate('params', uuidParams('projectId')),
    validate('body', addProjectMemberSchema),
    mutationHandler(db, '/api/v1/projects/{projectId}/members', async (request, transaction) => {
      const projectId = stringParam(request, 'projectId');
      const member = await service(transaction).addMember(
        projectId,
        authUserId(request),
        request.body as never,
      );
      const project = await new ProjectRepository(transaction).find(projectId);
      return {
        status: 201,
        body: { data: member },
        audit: {
          action: 'PROJECT_MEMBER_ADDED',
          entityType: 'PROJECT_MEMBER',
          entityId: member.id,
          ...(project === null ? {} : { teamId: project.teamId }),
          metadata: { projectId, userId: member.userId },
        },
      };
    }),
  );
  projects.patch(
    '/:projectId/members/:userId',
    validate('body', updateProjectMemberSchema),
    mutationHandler(
      db,
      '/api/v1/projects/{projectId}/members/{userId}',
      async (request, transaction) => {
        const projectId = stringParam(request, 'projectId'),
          userId = stringParam(request, 'userId');
        const member = await service(transaction).updateMember(
          projectId,
          userId,
          authUserId(request),
          (request.body as { role: never }).role,
        );
        const project = await new ProjectRepository(transaction).find(projectId);
        return {
          status: 200,
          body: { data: member },
          audit: {
            action: 'PROJECT_MEMBER_UPDATED',
            entityType: 'PROJECT_MEMBER',
            entityId: member.id,
            ...(project === null ? {} : { teamId: project.teamId }),
            metadata: { projectId, userId },
          },
        };
      },
    ),
  );
  projects.delete(
    '/:projectId/members/:userId',
    mutationHandler(
      db,
      '/api/v1/projects/{projectId}/members/{userId}',
      async (request, transaction) => {
        const projectId = stringParam(request, 'projectId'),
          userId = stringParam(request, 'userId');
        const member = await service(transaction).removeMember(
          projectId,
          userId,
          authUserId(request),
        );
        const project = await new ProjectRepository(transaction).find(projectId);
        return {
          status: 204,
          body: null,
          audit: {
            action: 'PROJECT_MEMBER_REMOVED',
            entityType: 'PROJECT_MEMBER',
            entityId: member.id,
            ...(project === null ? {} : { teamId: project.teamId }),
            metadata: { projectId, userId },
          },
        };
      },
    ),
  );
  return { teams, projects };
}
