import type { DatabaseHandle } from '../../infrastructure/database/prisma.js';
export class AttachmentRepository {
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
  create(data: {
    taskId: string;
    uploadedBy: string;
    storageProvider: string;
    storageBucket: string;
    storageKey: string;
    originalFilename: string;
    contentType: string;
    sizeBytes: bigint;
  }) {
    return this.db.taskAttachment.create({ data: { ...data, status: 'PENDING' } });
  }
  find(id: string) {
    return this.db.taskAttachment.findFirst({ where: { id, deletedAt: null } });
  }
  ready(id: string, checksumSha256?: string) {
    return this.db.taskAttachment.update({
      where: { id },
      data: { status: 'READY', ...(!checksumSha256 ? {} : { checksumSha256 }) },
    });
  }
  list(taskId: string) {
    return this.db.taskAttachment.findMany({
      where: { taskId, status: 'READY', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }
  remove(id: string) {
    return this.db.taskAttachment.update({
      where: { id },
      data: { status: 'DELETED', deletedAt: new Date() },
    });
  }
  stalePending(before: Date) {
    return this.db.taskAttachment.findMany({
      where: { status: 'PENDING', createdAt: { lt: before } },
      take: 100,
    });
  }
}
