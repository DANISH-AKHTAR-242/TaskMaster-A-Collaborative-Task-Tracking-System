import type { ProjectRole } from '../../generated/prisma/enums.js';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';
export class ProjectRepository {
  constructor(private readonly db: DatabaseClient) {}
  teamMembership(teamId: string, userId: string) {
    return this.db.teamMember.findFirst({
      where: { teamId, userId, removedAt: null, team: { deletedAt: null } },
    });
  }
  membership(projectId: string, userId: string) {
    return this.db.projectMember.findFirst({
      where: { projectId, userId, removedAt: null, project: { deletedAt: null, archivedAt: null } },
    });
  }
  createWithAdmin(
    teamId: string,
    userId: string,
    input: { name: string; description?: string | null },
  ) {
    return this.db.$transaction(async (tx) => {
      const project = await tx.project.create({ data: { teamId, createdBy: userId, ...input } });
      await tx.projectMember.create({
        data: { projectId: project.id, userId, addedBy: userId, role: 'ADMIN' },
      });
      return project;
    });
  }
  list(teamId: string, userId: string, teamAdmin: boolean) {
    return this.db.project.findMany({
      where: {
        teamId,
        deletedAt: null,
        ...(teamAdmin ? {} : { members: { some: { userId, removedAt: null } } }),
      },
      select: {
        id: true,
        teamId: true,
        name: true,
        description: true,
        createdBy: true,
        createdAt: true,
        updatedAt: true,
        archivedAt: true,
        deletedAt: true,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
  find(id: string, includeDeleted = false) {
    return this.db.project.findFirst({
      where: { id, ...(includeDeleted ? {} : { deletedAt: null }) },
    });
  }
  update(id: string, data: { name?: string; description?: string | null }) {
    return this.db.project.update({ where: { id }, data });
  }
  remove(id: string) {
    return this.db.project.update({ where: { id }, data: { deletedAt: new Date() } });
  }
  restore(id: string) {
    return this.db.project.update({ where: { id }, data: { deletedAt: null } });
  }
  members(id: string) {
    return this.db.projectMember.findMany({
      where: { projectId: id, removedAt: null },
      include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true } } },
    });
  }
  projectMember(id: string, userId: string) {
    return this.db.projectMember.findUnique({
      where: { projectId_userId: { projectId: id, userId } },
    });
  }
  addMember(projectId: string, userId: string, role: ProjectRole, addedBy: string) {
    return this.db.projectMember.upsert({
      where: { projectId_userId: { projectId, userId } },
      create: { projectId, userId, role, addedBy },
      update: { role, addedBy, removedAt: null, joinedAt: new Date() },
    });
  }
  updateMember(projectId: string, userId: string, role: ProjectRole) {
    return this.db.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { role },
    });
  }
  removeMember(projectId: string, userId: string) {
    return this.db.projectMember.update({
      where: { projectId_userId: { projectId, userId } },
      data: { removedAt: new Date() },
    });
  }
}
