import { forbidden, notFound } from '../../shared/errors/app-error.js';
import type { CommentRepository } from './repository.js';
export class CommentService {
  constructor(private readonly r: CommentRepository) {}
  async create(taskId: string, userId: string, body: string) {
    const role = (await this.r.access(taskId, userId))?.role;
    if (role === undefined) throw notFound();
    if (role === 'VIEWER') throw forbidden();
    return this.r.create(taskId, userId, body);
  }
  async list(taskId: string, userId: string) {
    if ((await this.r.access(taskId, userId)) === null) throw notFound();
    return this.r.list(taskId);
  }
  async update(id: string, userId: string, body: string) {
    const c = await this.r.find(id);
    if (c === null || (await this.r.access(c.taskId, userId)) === null) throw notFound();
    if (c.authorId !== userId) throw forbidden();
    return this.r.update(id, body);
  }
  async remove(id: string, userId: string) {
    const c = await this.r.find(id);
    if (c === null) throw notFound();
    const access = await this.r.access(c.taskId, userId);
    if (access === null) throw notFound();
    if (c.authorId !== userId && access.role !== 'ADMIN') throw forbidden();
    return this.r.remove(id);
  }
}
