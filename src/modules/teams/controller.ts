import type { RequestHandler } from 'express';
import { authUserId, stringParam } from '../../shared/utilities/http.js';
import type { TeamService } from './service.js';

export class TeamController {
  public constructor(private readonly service: TeamService) {}
  create: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await this.service.create(authUserId(req), req.body as never) });
  };
  list: RequestHandler = async (req, res) => {
    res.json({ data: await this.service.list(authUserId(req)) });
  };
  get: RequestHandler = async (req, res) => {
    res.json({ data: await this.service.get(stringParam(req, 'teamId'), authUserId(req)) });
  };
  update: RequestHandler = async (req, res) => {
    res.json({
      data: await this.service.update(
        stringParam(req, 'teamId'),
        authUserId(req),
        req.body as never,
      ),
    });
  };
  remove: RequestHandler = async (req, res) => {
    await this.service.remove(stringParam(req, 'teamId'), authUserId(req));
    res.status(204).send();
  };
  restore: RequestHandler = async (req, res) => {
    res.json({ data: await this.service.restore(stringParam(req, 'teamId'), authUserId(req)) });
  };
  members: RequestHandler = async (req, res) => {
    res.json({ data: await this.service.members(stringParam(req, 'teamId'), authUserId(req)) });
  };
  changeMember: RequestHandler = async (req, res) => {
    res.json({
      data: await this.service.changeMember(
        stringParam(req, 'teamId'),
        stringParam(req, 'userId'),
        authUserId(req),
        (req.body as { role: never }).role,
      ),
    });
  };
  removeMember: RequestHandler = async (req, res) => {
    await this.service.removeMember(
      stringParam(req, 'teamId'),
      stringParam(req, 'userId'),
      authUserId(req),
    );
    res.status(204).send();
  };
  transfer: RequestHandler = async (req, res) => {
    await this.service.transfer(
      stringParam(req, 'teamId'),
      authUserId(req),
      (req.body as { newOwnerUserId: string }).newOwnerUserId,
    );
    res.status(204).send();
  };
  invite: RequestHandler = async (req, res) => {
    res.status(201).json({
      data: await this.service.invite(
        stringParam(req, 'teamId'),
        authUserId(req),
        req.body as never,
      ),
    });
  };
  invitations: RequestHandler = async (req, res) => {
    res.json({ data: await this.service.invitations(stringParam(req, 'teamId'), authUserId(req)) });
  };
  revokeInvitation: RequestHandler = async (req, res) => {
    await this.service.revokeInvitation(
      stringParam(req, 'teamId'),
      stringParam(req, 'invitationId'),
      authUserId(req),
    );
    res.status(204).send();
  };
  accept: RequestHandler = async (req, res) => {
    res.json({
      data: await this.service.accept(authUserId(req), (req.body as { token: string }).token),
    });
  };
}
