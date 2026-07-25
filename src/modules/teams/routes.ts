import { Router, type RequestHandler } from 'express';
import { validate } from '../../app/middleware/validate.js';
import type { Env } from '../../config/env.js';
import type { DatabaseClient, DatabaseHandle } from '../../infrastructure/database/prisma.js';
import { mutationHandler } from '../../shared/mutations/handler.js';
import { authUserId, stringParam } from '../../shared/utilities/http.js';
import { uuidParams } from '../../shared/validation/common.js';
import { UserRepository } from '../users/repository.js';
import { TeamController } from './controller.js';
import { TeamRepository } from './repository.js';
import {
  acceptInvitationSchema,
  changeTeamMemberSchema,
  createInvitationSchema,
  createTeamSchema,
  transferOwnershipSchema,
  updateTeamSchema,
} from './schemas.js';
import { TeamService } from './service.js';

export function teamRoutes(database: DatabaseClient, env: Env, authenticate: RequestHandler) {
  const teams = Router();
  const accept = Router();
  const service = (handle: DatabaseHandle) =>
    new TeamService(new TeamRepository(handle), new UserRepository(handle), env);
  const c = new TeamController(service(database));
  teams.use(authenticate);
  accept.use(authenticate);
  teams.post(
    '/',
    validate('body', createTeamSchema),
    mutationHandler(
      database,
      '/api/v1/teams',
      async (request, transaction) => {
        const team = await service(transaction).create(authUserId(request), request.body as never);
        return {
          status: 201,
          body: { data: team },
          audit: { action: 'TEAM_CREATED', entityType: 'TEAM', entityId: team.id, teamId: team.id },
        };
      },
      { idempotent: true },
    ),
  );
  teams.get('/', c.list);
  teams.get('/:teamId', validate('params', uuidParams('teamId')), c.get);
  teams.patch(
    '/:teamId',
    validate('params', uuidParams('teamId')),
    validate('body', updateTeamSchema),
    mutationHandler(database, '/api/v1/teams/{teamId}', async (request, transaction) => {
      const teamId = stringParam(request, 'teamId');
      const team = await service(transaction).update(
        teamId,
        authUserId(request),
        request.body as never,
      );
      return {
        status: 200,
        body: { data: team },
        audit: { action: 'TEAM_UPDATED', entityType: 'TEAM', entityId: teamId, teamId },
      };
    }),
  );
  teams.delete(
    '/:teamId',
    validate('params', uuidParams('teamId')),
    mutationHandler(database, '/api/v1/teams/{teamId}', async (request, transaction) => {
      const teamId = stringParam(request, 'teamId');
      await service(transaction).remove(teamId, authUserId(request));
      return {
        status: 204,
        body: null,
        audit: { action: 'TEAM_DELETED', entityType: 'TEAM', entityId: teamId, teamId },
      };
    }),
  );
  teams.post(
    '/:teamId/restore',
    validate('params', uuidParams('teamId')),
    mutationHandler(database, '/api/v1/teams/{teamId}/restore', async (request, transaction) => {
      const teamId = stringParam(request, 'teamId');
      const team = await service(transaction).restore(teamId, authUserId(request));
      return {
        status: 200,
        body: { data: team },
        audit: { action: 'TEAM_RESTORED', entityType: 'TEAM', entityId: teamId, teamId },
      };
    }),
  );
  teams.get('/:teamId/members', validate('params', uuidParams('teamId')), c.members);
  teams.patch(
    '/:teamId/members/:userId',
    validate(
      'params',
      uuidParams('teamId').extend({ userId: uuidParams('userId').shape['userId'] }),
    ),
    validate('body', changeTeamMemberSchema),
    mutationHandler(
      database,
      '/api/v1/teams/{teamId}/members/{userId}',
      async (request, transaction) => {
        const teamId = stringParam(request, 'teamId'),
          userId = stringParam(request, 'userId');
        const member = await service(transaction).changeMember(
          teamId,
          userId,
          authUserId(request),
          (request.body as { role: never }).role,
        );
        return {
          status: 200,
          body: { data: member },
          audit: {
            action: 'TEAM_MEMBER_UPDATED',
            entityType: 'TEAM_MEMBER',
            entityId: member.id,
            teamId,
            metadata: { userId },
          },
        };
      },
    ),
  );
  teams.delete(
    '/:teamId/members/:userId',
    validate(
      'params',
      uuidParams('teamId').extend({ userId: uuidParams('userId').shape['userId'] }),
    ),
    mutationHandler(
      database,
      '/api/v1/teams/{teamId}/members/{userId}',
      async (request, transaction) => {
        const teamId = stringParam(request, 'teamId'),
          userId = stringParam(request, 'userId');
        const member = await service(transaction).removeMember(teamId, userId, authUserId(request));
        return {
          status: 204,
          body: null,
          audit: {
            action: 'TEAM_MEMBER_REMOVED',
            entityType: 'TEAM_MEMBER',
            entityId: member.id,
            teamId,
            metadata: { userId },
          },
        };
      },
    ),
  );
  teams.post(
    '/:teamId/ownership-transfer',
    validate('params', uuidParams('teamId')),
    validate('body', transferOwnershipSchema),
    mutationHandler(
      database,
      '/api/v1/teams/{teamId}/ownership-transfer',
      async (request, transaction) => {
        const teamId = stringParam(request, 'teamId'),
          newOwnerUserId = (request.body as { newOwnerUserId: string }).newOwnerUserId;
        await service(transaction).transfer(teamId, authUserId(request), newOwnerUserId);
        return {
          status: 204,
          body: null,
          audit: {
            action: 'TEAM_OWNERSHIP_TRANSFERRED',
            entityType: 'TEAM',
            entityId: teamId,
            teamId,
            metadata: { newOwnerUserId },
          },
        };
      },
    ),
  );
  teams.post(
    '/:teamId/invitations',
    validate('params', uuidParams('teamId')),
    validate('body', createInvitationSchema),
    mutationHandler(
      database,
      '/api/v1/teams/{teamId}/invitations',
      async (request, transaction) => {
        const teamId = stringParam(request, 'teamId');
        const invitation = await service(transaction).invite(
          teamId,
          authUserId(request),
          request.body as never,
        );
        return {
          status: 201,
          body: { data: invitation },
          audit: {
            action: 'TEAM_INVITATION_CREATED',
            entityType: 'TEAM_INVITATION',
            entityId: invitation.invitation.id,
            teamId,
          },
        };
      },
      { idempotent: true },
    ),
  );
  teams.get('/:teamId/invitations', validate('params', uuidParams('teamId')), c.invitations);
  teams.delete(
    '/:teamId/invitations/:invitationId',
    mutationHandler(
      database,
      '/api/v1/teams/{teamId}/invitations/{invitationId}',
      async (request, transaction) => {
        const teamId = stringParam(request, 'teamId'),
          invitationId = stringParam(request, 'invitationId');
        await service(transaction).revokeInvitation(teamId, invitationId, authUserId(request));
        return {
          status: 204,
          body: null,
          audit: {
            action: 'TEAM_INVITATION_REVOKED',
            entityType: 'TEAM_INVITATION',
            entityId: invitationId,
            teamId,
          },
        };
      },
    ),
  );
  accept.post(
    '/accept',
    validate('body', acceptInvitationSchema),
    mutationHandler(database, '/api/v1/team-invitations/accept', async (request, transaction) => {
      const result = await service(transaction).accept(
        authUserId(request),
        (request.body as { token: string }).token,
      );
      return {
        status: 200,
        body: { data: result },
        audit: {
          action: 'TEAM_INVITATION_ACCEPTED',
          entityType: 'TEAM',
          entityId: result.teamId,
          teamId: result.teamId,
        },
      };
    }),
  );
  return { teams, accept };
}
