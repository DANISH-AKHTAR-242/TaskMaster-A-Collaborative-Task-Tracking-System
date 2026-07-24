import type { TaskStatus } from '../../generated/prisma/enums.js';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';
export interface TaskFilters {
  status?: TaskStatus[];
  assigneeId?: string;
  unassigned?: boolean;
  createdBy?: string;
  dueBefore?: string;
  dueAfter?: string;
  search?: string;
  limit: number;
  sort: string;
  order: 'asc' | 'desc';
  cursorId?: string;
}
export class TaskRepository {
  constructor(private readonly db: DatabaseClient) {}
  membership(projectId: string, userId: string) {
    return this.db.projectMember.findFirst({
      where: { projectId, userId, removedAt: null, project: { deletedAt: null, archivedAt: null } },
    });
  }
  assignee(projectId: string, userId: string) {
    return this.membership(projectId, userId);
  }
  create(
    projectId: string,
    userId: string,
    input: {
      title: string;
      description?: string | null;
      dueAt?: string | null;
      assigneeId?: string | null;
    },
  ) {
    return this.db.task.create({
      data: {
        projectId,
        createdBy: userId,
        title: input.title,
        ...(input.description === undefined ? {} : { description: input.description }),
        dueAt: input.dueAt === undefined || input.dueAt === null ? null : new Date(input.dueAt),
        ...(input.assigneeId === undefined ? {} : { assigneeId: input.assigneeId }),
      },
    });
  }
  find(id: string, includeDeleted = false) {
    return this.db.task.findFirst({
      where: { id, ...(includeDeleted ? {} : { deletedAt: null }) },
    });
  }
  roleForTask(id: string, userId: string) {
    return this.db.projectMember.findFirst({
      where: { userId, removedAt: null, project: { deletedAt: null, tasks: { some: { id } } } },
    });
  }
  async updateVersioned(
    id: string,
    version: number,
    data: {
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      dueAt?: string | null;
      assigneeId?: string | null;
    },
  ) {
    const converted = {
      ...data,
      ...(data.dueAt === undefined
        ? {}
        : { dueAt: data.dueAt === null ? null : new Date(data.dueAt) }),
      ...(data.status === undefined
        ? {}
        : { completedAt: data.status === 'COMPLETED' ? new Date() : null }),
    };
    const result = await this.db.task.updateMany({
      where: { id, version, deletedAt: null },
      data: { ...converted, version: { increment: 1 } },
    });
    if (result.count === 0) return null;
    return this.find(id);
  }
  remove(id: string) {
    return this.db.task.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
  }
  restore(id: string) {
    return this.db.task.update({
      where: { id },
      data: { deletedAt: null, version: { increment: 1 } },
    });
  }
  list(projectId: string | undefined, userId: string, filters: TaskFilters) {
    const orderBy =
      filters.sort === 'dueAt'
        ? [{ dueAt: { sort: filters.order, nulls: 'last' as const } }, { id: filters.order }]
        : [{ [filters.sort]: filters.order }, { id: filters.order }];
    return this.db.task.findMany({
      where: {
        deletedAt: null,
        ...(projectId === undefined
          ? { project: { members: { some: { userId, removedAt: null } }, deletedAt: null } }
          : { projectId }),
        ...(filters.status ? { status: { in: filters.status } } : {}),
        ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
        ...(filters.unassigned ? { assigneeId: null } : {}),
        ...(filters.createdBy ? { createdBy: filters.createdBy } : {}),
        ...(filters.dueBefore || filters.dueAfter
          ? {
              dueAt: {
                ...(filters.dueBefore ? { lt: new Date(filters.dueBefore) } : {}),
                ...(filters.dueAfter ? { gt: new Date(filters.dueAfter) } : {}),
              },
            }
          : {}),
        ...(filters.search
          ? {
              OR: [
                { title: { contains: filters.search, mode: 'insensitive' } },
                { description: { contains: filters.search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(filters.cursorId ? { id: { lt: filters.cursorId } } : {}),
      },
      orderBy: orderBy as never,
      take: filters.limit + 1,
    });
  }
}
