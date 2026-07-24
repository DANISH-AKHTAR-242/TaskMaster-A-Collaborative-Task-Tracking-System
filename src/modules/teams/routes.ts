import { Router, type RequestHandler } from 'express';
import { validate } from '../../app/middleware/validate.js';
import type { Env } from '../../config/env.js';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';
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
  const c = new TeamController(
    new TeamService(new TeamRepository(database), new UserRepository(database), env),
  );
  teams.use(authenticate);
  accept.use(authenticate);
  teams.post('/', validate('body', createTeamSchema), c.create);
  teams.get('/', c.list);
  teams.get('/:teamId', validate('params', uuidParams('teamId')), c.get);
  teams.patch(
    '/:teamId',
    validate('params', uuidParams('teamId')),
    validate('body', updateTeamSchema),
    c.update,
  );
  teams.delete('/:teamId', validate('params', uuidParams('teamId')), c.remove);
  teams.post('/:teamId/restore', validate('params', uuidParams('teamId')), c.restore);
  teams.get('/:teamId/members', validate('params', uuidParams('teamId')), c.members);
  teams.patch(
    '/:teamId/members/:userId',
    validate(
      'params',
      uuidParams('teamId').extend({ userId: uuidParams('userId').shape['userId'] }),
    ),
    validate('body', changeTeamMemberSchema),
    c.changeMember,
  );
  teams.delete(
    '/:teamId/members/:userId',
    validate(
      'params',
      uuidParams('teamId').extend({ userId: uuidParams('userId').shape['userId'] }),
    ),
    c.removeMember,
  );
  teams.post(
    '/:teamId/ownership-transfer',
    validate('params', uuidParams('teamId')),
    validate('body', transferOwnershipSchema),
    c.transfer,
  );
  teams.post(
    '/:teamId/invitations',
    validate('params', uuidParams('teamId')),
    validate('body', createInvitationSchema),
    c.invite,
  );
  teams.get('/:teamId/invitations', validate('params', uuidParams('teamId')), c.invitations);
  teams.delete('/:teamId/invitations/:invitationId', c.revokeInvitation);
  accept.post('/accept', validate('body', acceptInvitationSchema), c.accept);
  return { teams, accept };
}
