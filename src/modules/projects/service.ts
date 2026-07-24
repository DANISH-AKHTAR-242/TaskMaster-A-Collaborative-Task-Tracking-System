import type { ProjectRole, TeamRole } from '../../generated/prisma/enums.js';
import { conflict, forbidden, notFound } from '../../shared/errors/app-error.js';
import { canAdministerProject } from './policy.js';
import type { ProjectRepository } from './repository.js';
export class ProjectService {
  constructor(private readonly repo: ProjectRepository) {}
  private async projectRole(id: string, userId: string): Promise<ProjectRole> {
    const m = await this.repo.membership(id, userId);
    if (m === null) throw notFound();
    return m.role;
  }
  private async teamRole(id: string, userId: string): Promise<TeamRole> {
    const m = await this.repo.teamMembership(id, userId);
    if (m === null) throw notFound();
    return m.role;
  }
  async create(
    teamId: string,
    userId: string,
    input: { name: string; description?: string | null },
  ) {
    const role = await this.teamRole(teamId, userId);
    if (role === 'MEMBER') throw forbidden();
    return this.repo.createWithAdmin(teamId, userId, input);
  }
  async list(teamId: string, userId: string) {
    const role = await this.teamRole(teamId, userId);
    return this.repo.list(teamId, userId, role !== 'MEMBER');
  }
  async get(id: string, userId: string) {
    await this.projectRole(id, userId);
    const p = await this.repo.find(id);
    if (p === null) throw notFound();
    return p;
  }
  async update(id: string, userId: string, input: { name?: string; description?: string | null }) {
    if (!canAdministerProject(await this.projectRole(id, userId))) throw forbidden();
    return this.repo.update(id, input);
  }
  async remove(id: string, userId: string) {
    if (!canAdministerProject(await this.projectRole(id, userId))) throw forbidden();
    return this.repo.remove(id);
  }
  async restore(id: string, userId: string) {
    const membership = await this.repo.projectMember(id, userId);
    if (membership?.role !== 'ADMIN' || membership.removedAt !== null) throw notFound();
    return this.repo.restore(id);
  }
  async members(id: string, userId: string) {
    await this.projectRole(id, userId);
    return this.repo.members(id);
  }
  async authorizeMemberAdmin(id: string, userId: string) {
    const project = await this.repo.find(id);
    if (project === null) throw notFound();
    const pm = await this.repo.membership(id, userId);
    if (pm?.role === 'ADMIN') return project;
    const tm = await this.repo.teamMembership(project.teamId, userId);
    if (tm?.role !== 'OWNER' && tm?.role !== 'ADMIN') throw notFound();
    return project;
  }
  async addMember(id: string, actorId: string, input: { userId: string; role: ProjectRole }) {
    const project = await this.authorizeMemberAdmin(id, actorId);
    if ((await this.repo.teamMembership(project.teamId, input.userId)) === null)
      throw conflict('PROJECT_MEMBER_NOT_IN_TEAM', 'Only active team members can join a project.');
    return this.repo.addMember(id, input.userId, input.role, actorId);
  }
  async updateMember(id: string, targetId: string, actorId: string, role: ProjectRole) {
    if (!canAdministerProject(await this.projectRole(id, actorId))) throw forbidden();
    const target = await this.repo.projectMember(id, targetId);
    if (target?.removedAt !== null) throw notFound();
    return this.repo.updateMember(id, targetId, role);
  }
  async removeMember(id: string, targetId: string, actorId: string) {
    if (!canAdministerProject(await this.projectRole(id, actorId))) throw forbidden();
    const target = await this.repo.projectMember(id, targetId);
    if (target?.removedAt !== null) throw notFound();
    return this.repo.removeMember(id, targetId);
  }
}
