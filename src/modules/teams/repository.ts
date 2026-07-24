import type { TeamRole } from '../../generated/prisma/enums.js';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';

export class TeamRepository {
  public constructor(private readonly db: DatabaseClient) {}
  membership(teamId: string, userId: string) {
    return this.db.teamMember.findFirst({
      where: { teamId, userId, removedAt: null, team: { deletedAt: null } },
    });
  }
  createWithOwner(userId: string, input: { name: string; slug: string }) {
    return this.db.$transaction(async (tx) => {
      const team = await tx.team.create({ data: { ...input, createdBy: userId } });
      await tx.teamMember.create({ data: { teamId: team.id, userId, role: 'OWNER' } });
      return team;
    });
  }
  list(userId: string) {
    return this.db.team.findMany({
      where: { deletedAt: null, members: { some: { userId, removedAt: null } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
  find(teamId: string) {
    return this.db.team.findFirst({ where: { id: teamId, deletedAt: null } });
  }
  update(teamId: string, data: { name?: string; slug?: string }) {
    return this.db.team.update({ where: { id: teamId }, data });
  }
  softDelete(teamId: string) {
    return this.db.team.update({ where: { id: teamId }, data: { deletedAt: new Date() } });
  }
  restore(teamId: string) {
    return this.db.team.update({ where: { id: teamId }, data: { deletedAt: null } });
  }
  members(teamId: string) {
    return this.db.teamMember.findMany({
      where: { teamId, removedAt: null },
      include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true } } },
      orderBy: { joinedAt: 'asc' },
    });
  }
  activeOwnerCount(teamId: string) {
    return this.db.teamMember.count({ where: { teamId, role: 'OWNER', removedAt: null } });
  }
  findMember(teamId: string, userId: string) {
    return this.db.teamMember.findUnique({ where: { teamId_userId: { teamId, userId } } });
  }
  setMemberRole(teamId: string, userId: string, role: TeamRole) {
    return this.db.teamMember.update({
      where: { teamId_userId: { teamId, userId } },
      data: { role, removedAt: null },
    });
  }
  removeMember(teamId: string, userId: string) {
    return this.db.teamMember.update({
      where: { teamId_userId: { teamId, userId } },
      data: { removedAt: new Date() },
    });
  }
  transfer(teamId: string, currentUserId: string, newUserId: string) {
    return this.db.$transaction(async (tx) => {
      await tx.teamMember.update({
        where: { teamId_userId: { teamId, userId: newUserId } },
        data: { role: 'OWNER' },
      });
      await tx.teamMember.update({
        where: { teamId_userId: { teamId, userId: currentUserId } },
        data: { role: 'ADMIN' },
      });
    });
  }
  createInvitation(data: {
    teamId: string;
    email: string;
    role: TeamRole;
    tokenHash: string;
    invitedBy: string;
    expiresAt: Date;
  }) {
    return this.db.teamInvitation.create({ data });
  }
  invitations(teamId: string) {
    return this.db.teamInvitation.findMany({
      where: { teamId },
      select: {
        id: true,
        teamId: true,
        email: true,
        role: true,
        invitedBy: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  invitation(teamId: string, id: string) {
    return this.db.teamInvitation.findFirst({ where: { id, teamId } });
  }
  revokeInvitation(id: string) {
    return this.db.teamInvitation.update({ where: { id }, data: { revokedAt: new Date() } });
  }
  invitationByHash(tokenHash: string) {
    return this.db.teamInvitation.findUnique({ where: { tokenHash }, include: { team: true } });
  }
  acceptInvitation(id: string, teamId: string, userId: string, role: TeamRole) {
    return this.db.$transaction(async (tx) => {
      const invitation = await tx.teamInvitation.updateMany({
        where: { id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (invitation.count === 0) return false;
      await tx.teamMember.upsert({
        where: { teamId_userId: { teamId, userId } },
        create: { teamId, userId, role },
        update: { role, removedAt: null, joinedAt: new Date() },
      });
      return true;
    });
  }
}
