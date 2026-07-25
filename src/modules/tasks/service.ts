import type { Env } from '../../config/env.js';
import type { ProjectRole, TaskStatus } from '../../generated/prisma/enums.js';
import { AppError, conflict, forbidden, notFound } from '../../shared/errors/app-error.js';
import { decodeCursor, encodeCursor, filterHash } from '../../shared/pagination/cursor.js';
import { canCreateTask, canDeleteTask, canUpdateTask } from './policy.js';
import type { TaskFilters, TaskRepository } from './repository.js';
export class TaskService {
  constructor(
    private readonly repo: TaskRepository,
    private readonly env: Pick<Env, 'CURSOR_SECRET'>,
  ) {}
  private async role(projectId: string, userId: string): Promise<ProjectRole> {
    const m = await this.repo.membership(projectId, userId);
    if (m === null) throw notFound();
    return m.role;
  }
  async create(
    projectId: string,
    userId: string,
    input: {
      title: string;
      description?: string | null;
      dueAt?: string | null;
      assigneeId?: string | null;
    },
  ) {
    if (!canCreateTask(await this.role(projectId, userId))) throw forbidden();
    if (input.assigneeId && (await this.repo.assignee(projectId, input.assigneeId)) === null)
      throw conflict('INVALID_TASK_ASSIGNEE', 'The assignee must be an active project member.');
    return this.repo.create(projectId, userId, input);
  }
  async get(id: string, userId: string) {
    const task = await this.repo.find(id);
    if (task === null || (await this.repo.roleForTask(id, userId)) === null) throw notFound();
    return task;
  }
  async update(
    id: string,
    userId: string,
    input: {
      version: number;
      title?: string;
      description?: string | null;
      status?: TaskStatus;
      dueAt?: string | null;
      assigneeId?: string | null;
    },
  ) {
    const task = await this.get(id, userId);
    const role = await this.role(task.projectId, userId);
    if (!canUpdateTask(role, userId, task)) throw forbidden();
    if (input.assigneeId && (await this.repo.assignee(task.projectId, input.assigneeId)) === null)
      throw conflict('INVALID_TASK_ASSIGNEE', 'The assignee must be an active project member.');
    const { version, ...data } = input;
    const updated = await this.repo.updateVersioned(id, version, data);
    if (updated === null)
      throw conflict('TASK_VERSION_CONFLICT', 'The task was changed by another request.');
    return updated;
  }
  async remove(id: string, userId: string) {
    const task = await this.get(id, userId);
    if (!canDeleteTask(await this.role(task.projectId, userId))) throw forbidden();
    return this.repo.remove(id);
  }
  async restore(id: string, userId: string) {
    const task = await this.repo.find(id, true);
    if (task === null || !canDeleteTask(await this.role(task.projectId, userId))) throw notFound();
    return this.repo.restore(id);
  }
  async list(
    projectId: string | undefined,
    userId: string,
    query: Omit<TaskFilters, 'cursorId'> & { assignee?: 'me'; cursor?: string },
  ) {
    if (projectId !== undefined) await this.role(projectId, userId);
    const effectiveSort = query.search === undefined ? query.sort : 'rank';
    const effectiveOrder = query.search === undefined ? query.order : 'desc';
    const bound = {
      ...query,
      sort: effectiveSort,
      order: effectiveOrder,
      cursor: undefined,
      limit: undefined,
    };
    const hash = filterHash(bound);
    const cursor = query.cursor
      ? decodeCursor(query.cursor, this.env.CURSOR_SECRET, hash)
      : undefined;
    if (
      cursor !== undefined &&
      (cursor.sort !== effectiveSort || cursor.order !== effectiveOrder)
    ) {
      throw new AppError(
        422,
        'INVALID_CURSOR',
        'Request validation failed',
        'The pagination cursor does not match the requested sort.',
      );
    }
    const rows = await this.repo.list(projectId, userId, {
      ...query,
      order: effectiveOrder,
      ...(query.assignee === 'me'
        ? { assigneeId: userId }
        : query.assigneeId === undefined
          ? {}
          : { assigneeId: query.assigneeId }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    const hasMore = rows.length > query.limit;
    const selected = rows.slice(0, query.limit);
    const last = selected.at(-1);
    const data = selected.map(({ searchRank, ...task }) => {
      void searchRank;
      return task;
    });
    const cursorValue =
      last === undefined
        ? null
        : query.search !== undefined
          ? String(last.searchRank)
          : query.sort === 'createdAt'
            ? last.createdAt.toISOString()
            : query.sort === 'updatedAt'
              ? last.updatedAt.toISOString()
              : query.sort === 'dueAt'
                ? (last.dueAt?.toISOString() ?? null)
                : query.sort === 'status'
                  ? last.status
                  : last.title;
    return {
      data,
      page: {
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor(
                {
                  filterHash: hash,
                  sort: effectiveSort,
                  order: effectiveOrder,
                  value: cursorValue,
                  id: last.id,
                },
                this.env.CURSOR_SECRET,
              )
            : null,
      },
    };
  }
}
