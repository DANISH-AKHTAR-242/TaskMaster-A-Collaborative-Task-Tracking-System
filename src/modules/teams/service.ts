import type { TeamRole } from '../../generated/prisma/enums.js';
import type { Env } from '../../config/env.js';
import { AppError, conflict, forbidden, notFound } from '../../shared/errors/app-error.js';
import { normalizeEmail, randomOpaqueToken, sha256 } from '../../shared/security/hash.js';
import type { UserRepository } from '../users/repository.js';
import { canAdministerTeam, canAssignTeamRole, canDeleteTeam } from './policy.js';
import type { TeamRepository } from './repository.js';

export class TeamService {
  public constructor(
    private readonly repo: TeamRepository,
    private readonly users: UserRepository,
    private readonly env: Pick<Env, 'INVITATION_TOKEN_TTL_SECONDS'>,
  ) {}
  private async role(teamId: string, userId: string): Promise<TeamRole> {
    const membership = await this.repo.membership(teamId, userId);
    if (membership === null) throw notFound();
    return membership.role;
  }
  create(userId: string, input: { name: string; slug: string }) {
    return this.repo.createWithOwner(userId, input);
  }
  list(userId: string) {
    return this.repo.list(userId);
  }
  async get(teamId: string, userId: string) {
    await this.role(teamId, userId);
    const team = await this.repo.find(teamId);
    if (team === null) throw notFound();
    return team;
  }
  async update(teamId: string, userId: string, input: { name?: string; slug?: string }) {
    if (!canAdministerTeam(await this.role(teamId, userId))) throw forbidden();
    return this.repo.update(teamId, input);
  }
  async remove(teamId: string, userId: string) {
    if (!canDeleteTeam(await this.role(teamId, userId))) throw forbidden();
    return this.repo.softDelete(teamId);
  }
  async restore(teamId: string, userId: string) {
    const membership = await this.repo.findMember(teamId, userId);
    if (membership?.role !== 'OWNER' || membership.removedAt !== null) throw notFound();
    return this.repo.restore(teamId);
  }
  async members(teamId: string, userId: string) {
    await this.role(teamId, userId);
    return this.repo.members(teamId);
  }
  async changeMember(teamId: string, targetId: string, userId: string, role: TeamRole) {
    const actor = await this.role(teamId, userId);
    if (!canAssignTeamRole(actor, role)) throw forbidden();
    const target = await this.repo.findMember(teamId, targetId);
    if (target?.removedAt !== null) throw notFound();
    if (
      target.role === 'OWNER' &&
      role !== 'OWNER' &&
      (await this.repo.activeOwnerCount(teamId)) <= 1
    )
      throw conflict('LAST_TEAM_OWNER', 'A team must retain an active owner.');
    return this.repo.setMemberRole(teamId, targetId, role);
  }
  async removeMember(teamId: string, targetId: string, userId: string) {
    const actor = await this.role(teamId, userId);
    if (!canAdministerTeam(actor)) throw forbidden();
    const target = await this.repo.findMember(teamId, targetId);
    if (target?.removedAt !== null) throw notFound();
    if (
      target.role === 'OWNER' &&
      (actor !== 'OWNER' || (await this.repo.activeOwnerCount(teamId)) <= 1)
    )
      throw conflict('LAST_TEAM_OWNER', 'A team must retain an active owner.');
    return this.repo.removeMember(teamId, targetId);
  }
  async transfer(teamId: string, userId: string, newOwnerUserId: string) {
    if ((await this.role(teamId, userId)) !== 'OWNER') throw forbidden();
    const target = await this.repo.membership(teamId, newOwnerUserId);
    if (target === null)
      throw new AppError(
        409,
        'INVALID_NEW_OWNER',
        'Conflict',
        'The new owner must be an active team member.',
      );
    await this.repo.transfer(teamId, userId, newOwnerUserId);
  }
  async invite(teamId: string, userId: string, input: { email: string; role: TeamRole }) {
    if (!canAdministerTeam(await this.role(teamId, userId)) || input.role === 'OWNER')
      throw forbidden();
    const token = randomOpaqueToken();
    const invitation = await this.repo.createInvitation({
      teamId,
      email: normalizeEmail(input.email),
      role: input.role,
      tokenHash: sha256(token),
      invitedBy: userId,
      expiresAt: new Date(Date.now() + this.env.INVITATION_TOKEN_TTL_SECONDS * 1000),
    });
    const { tokenHash: _tokenHash, ...publicInvitation } = invitation;
    void _tokenHash;
    return { invitation: publicInvitation, token };
  }
  async invitations(teamId: string, userId: string) {
    if (!canAdministerTeam(await this.role(teamId, userId))) throw forbidden();
    return this.repo.invitations(teamId);
  }
  async revokeInvitation(teamId: string, invitationId: string, userId: string) {
    if (!canAdministerTeam(await this.role(teamId, userId))) throw forbidden();
    const invitation = await this.repo.invitation(teamId, invitationId);
    if (invitation === null) throw notFound();
    return this.repo.revokeInvitation(invitation.id);
  }
  async accept(userId: string, token: string) {
    const invitation = await this.repo.invitationByHash(sha256(token));
    const user = await this.users.findActiveById(userId);
    if (
      invitation === null ||
      user === null ||
      invitation.team.deletedAt !== null ||
      normalizeEmail(invitation.email) !== normalizeEmail(user.email)
    )
      throw notFound();
    if (invitation.revokedAt !== null || invitation.expiresAt <= new Date())
      throw new AppError(
        409,
        'INVITATION_INVALID',
        'Conflict',
        'The invitation is revoked or expired.',
      );
    if (invitation.acceptedAt !== null) return { teamId: invitation.teamId };
    if (
      !(await this.repo.acceptInvitation(invitation.id, invitation.teamId, userId, invitation.role))
    )
      throw conflict('INVITATION_STATE_CHANGED', 'The invitation is no longer active.');
    return { teamId: invitation.teamId };
  }
}
