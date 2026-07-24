import type { Env } from '../../config/env.js';
import type { ProjectRole, TaskStatus } from '../../generated/prisma/enums.js';
import { conflict, forbidden, notFound } from '../../shared/errors/app-error.js';
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
    const bound = { ...query, cursor: undefined, limit: undefined };
    const hash = filterHash(bound);
    const cursorId = query.cursor
      ? decodeCursor(query.cursor, this.env.CURSOR_SECRET, hash).id
      : undefined;
    const rows = await this.repo.list(projectId, userId, {
      ...query,
      ...(query.assignee === 'me'
        ? { assigneeId: userId }
        : query.assigneeId === undefined
          ? {}
          : { assigneeId: query.assigneeId }),
      ...(cursorId ? { cursorId } : {}),
    });
    const hasMore = rows.length > query.limit;
    const data = rows.slice(0, query.limit);
    const last = data.at(-1);
    return {
      data,
      page: {
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor(
                {
                  filterHash: hash,
                  sort: query.sort,
                  order: query.order,
                  value: last.title,
                  id: last.id,
                },
                this.env.CURSOR_SECRET,
              )
            : null,
      },
    };
  }
}
