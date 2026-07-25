import type { DatabaseHandle } from '../../infrastructure/database/prisma.js';
export class CommentRepository {
  constructor(private readonly db: DatabaseHandle) {}
  access(taskId: string, userId: string) {
    return this.db.projectMember.findFirst({
      where: {
        userId,
        removedAt: null,
        project: { deletedAt: null, tasks: { some: { id: taskId, deletedAt: null } } },
      },
    });
  }
  create(taskId: string, authorId: string, body: string) {
    return this.db.taskComment.create({ data: { taskId, authorId, body } });
  }
  list(taskId: string) {
    return this.db.taskComment.findMany({
      where: { taskId, deletedAt: null },
      include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }
  find(id: string) {
    return this.db.taskComment.findFirst({
      where: { id, deletedAt: null },
      include: { task: true },
    });
  }
  update(id: string, body: string) {
    return this.db.taskComment.update({ where: { id }, data: { body } });
  }
  remove(id: string) {
    return this.db.taskComment.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
