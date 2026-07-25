import { Prisma } from '../../generated/prisma/client.js';
import type { TaskStatus } from '../../generated/prisma/enums.js';
import type { DatabaseHandle } from '../../infrastructure/database/prisma.js';
import type { CursorPayload } from '../../shared/pagination/cursor.js';
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
  cursor?: CursorPayload;
}

export interface ListedTask {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  dueAt: Date | null;
  createdBy: string;
  assigneeId: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  version: number;
  searchRank: number | null;
}
export class TaskRepository {
  constructor(private readonly db: DatabaseHandle) {}
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
    const conditions: Prisma.Sql[] = [Prisma.sql`t.deleted_at IS NULL`];
    if (projectId === undefined) {
      conditions.push(Prisma.sql`p.deleted_at IS NULL AND p.archived_at IS NULL`);
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = t.project_id AND pm.user_id = ${userId}::uuid AND pm.removed_at IS NULL
      )`);
    } else conditions.push(Prisma.sql`t.project_id = ${projectId}::uuid`);
    if (filters.status !== undefined)
      conditions.push(Prisma.sql`t.status::text IN (${Prisma.join(filters.status)})`);
    if (filters.assigneeId !== undefined)
      conditions.push(Prisma.sql`t.assignee_id = ${filters.assigneeId}::uuid`);
    if (filters.unassigned === true) conditions.push(Prisma.sql`t.assignee_id IS NULL`);
    if (filters.createdBy !== undefined)
      conditions.push(Prisma.sql`t.created_by = ${filters.createdBy}::uuid`);
    if (filters.dueBefore !== undefined)
      conditions.push(Prisma.sql`t.due_at < ${new Date(filters.dueBefore)}`);
    if (filters.dueAfter !== undefined)
      conditions.push(Prisma.sql`t.due_at > ${new Date(filters.dueAfter)}`);

    const query =
      filters.search === undefined
        ? Prisma.sql`NULL::real`
        : Prisma.sql`websearch_to_tsquery('english', ${filters.search})`;
    if (filters.search !== undefined) conditions.push(Prisma.sql`t.search_vector @@ ${query}`);

    const direction = filters.order === 'asc' ? Prisma.raw('ASC') : Prisma.raw('DESC');
    const comparison = filters.order === 'asc' ? Prisma.raw('>') : Prisma.raw('<');
    const sortColumns = {
      createdAt: Prisma.raw('t.created_at'),
      updatedAt: Prisma.raw('t.updated_at'),
      dueAt: Prisma.raw('t.due_at'),
      title: Prisma.raw('t.title'),
      status: Prisma.raw('t.status'),
    } as const;

    let orderBy: Prisma.Sql;
    if (filters.search !== undefined) {
      const rank = Prisma.sql`ts_rank(t.search_vector, ${query})`;
      orderBy = Prisma.sql`${rank} DESC, t.id DESC`;
      if (filters.cursor !== undefined) {
        conditions.push(
          Prisma.sql`(${rank} < ${Number(filters.cursor.value)} OR (${rank} = ${Number(filters.cursor.value)} AND t.id < ${filters.cursor.id}::uuid))`,
        );
      }
    } else {
      const column = sortColumns[filters.sort as keyof typeof sortColumns];
      if (filters.sort === 'dueAt') {
        orderBy = Prisma.sql`${column} ${direction} NULLS LAST, t.id ${direction}`;
        if (filters.cursor !== undefined) {
          if (filters.cursor.value === null) {
            conditions.push(
              Prisma.sql`t.due_at IS NULL AND t.id ${comparison} ${filters.cursor.id}::uuid`,
            );
          } else {
            const dueAt = new Date(filters.cursor.value);
            conditions.push(
              Prisma.sql`(t.due_at ${comparison} ${dueAt} OR (t.due_at = ${dueAt} AND t.id ${comparison} ${filters.cursor.id}::uuid) OR t.due_at IS NULL)`,
            );
          }
        }
      } else {
        orderBy = Prisma.sql`${column} ${direction}, t.id ${direction}`;
        if (filters.cursor !== undefined) {
          const value = filters.cursor.value;
          if (value === null) throw new Error('Non-null task sort cursor value is required');
          const valueSql =
            filters.sort === 'createdAt' || filters.sort === 'updatedAt'
              ? Prisma.sql`${new Date(value)}`
              : filters.sort === 'status'
                ? Prisma.sql`${value}::task_status`
                : Prisma.sql`${value}`;
          conditions.push(
            Prisma.sql`(${column} ${comparison} ${valueSql} OR (${column} = ${valueSql} AND t.id ${comparison} ${filters.cursor.id}::uuid))`,
          );
        }
      }
    }

    return this.db.$queryRaw<ListedTask[]>(Prisma.sql`
      SELECT t.id, t.project_id AS "projectId", t.title, t.description, t.status,
        t.due_at AS "dueAt", t.created_by AS "createdBy", t.assignee_id AS "assigneeId",
        t.completed_at AS "completedAt", t.created_at AS "createdAt", t.updated_at AS "updatedAt",
        t.deleted_at AS "deletedAt", t.version,
        ${filters.search === undefined ? Prisma.sql`NULL::real` : Prisma.sql`ts_rank(t.search_vector, ${query})`} AS "searchRank"
      FROM tasks t
      JOIN projects p ON p.id = t.project_id
      WHERE ${Prisma.join(conditions, ' AND ')}
      ORDER BY ${orderBy}
      LIMIT ${filters.limit + 1}
    `);
  }
}
