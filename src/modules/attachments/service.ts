import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.js';
import {
  DOWNLOAD_URL_TTL_SECONDS,
  PENDING_ATTACHMENT_TTL_HOURS,
  UPLOAD_URL_TTL_SECONDS,
} from '../../config/constants.js';
import { conflict, forbidden, notFound } from '../../shared/errors/app-error.js';
import type { ObjectStorage } from '../../infrastructure/storage/object-storage.js';
import type { AttachmentRepository } from './repository.js';
import { validateAttachment } from './validation.js';
const dto = (a: {
  id: string;
  taskId: string;
  uploadedBy: string;
  originalFilename: string;
  contentType: string;
  sizeBytes: bigint;
  status: string;
  checksumSha256: string | null;
  createdAt: Date;
}) => ({
  id: a.id,
  taskId: a.taskId,
  uploadedBy: a.uploadedBy,
  filename: a.originalFilename,
  contentType: a.contentType,
  sizeBytes: Number(a.sizeBytes),
  status: a.status,
  checksumSha256: a.checksumSha256,
  createdAt: a.createdAt.toISOString(),
});
export class AttachmentService {
  constructor(
    private readonly r: AttachmentRepository,
    private readonly storage: ObjectStorage,
    private readonly env: Pick<Env, 'NODE_ENV' | 'S3_BUCKET' | 'ATTACHMENT_MAX_BYTES'>,
  ) {}
  private async access(taskId: string, userId: string, write = false) {
    const m = await this.r.access(taskId, userId);
    if (m === null) throw notFound();
    if (write && m.role === 'VIEWER') throw forbidden();
    return m;
  }
  async initialize(
    taskId: string,
    userId: string,
    input: { filename: string; contentType: string; sizeBytes: number },
  ) {
    await this.access(taskId, userId, true);
    validateAttachment(input.contentType, input.sizeBytes, this.env.ATTACHMENT_MAX_BYTES);
    const key = `${this.env.NODE_ENV}/tasks/${taskId}/${randomUUID()}`;
    const a = await this.r.create({
      taskId,
      uploadedBy: userId,
      storageProvider: 's3',
      storageBucket: this.env.S3_BUCKET,
      storageKey: key,
      originalFilename: input.filename,
      contentType: input.contentType,
      sizeBytes: BigInt(input.sizeBytes),
    });
    return {
      attachment: dto(a),
      uploadUrl: await this.storage.presignUpload(key, input.contentType, UPLOAD_URL_TTL_SECONDS),
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    };
  }
  async complete(id: string, userId: string) {
    const a = await this.r.find(id);
    if (a === null) throw notFound();
    await this.access(a.taskId, userId, true);
    if (a.status === 'READY') return dto(a);
    if (a.status !== 'PENDING')
      throw conflict('ATTACHMENT_NOT_PENDING', 'The attachment is not pending.');
    const head = await this.storage.head(a.storageKey);
    if (head?.sizeBytes !== Number(a.sizeBytes) || head.contentType !== a.contentType)
      throw conflict(
        'ATTACHMENT_METADATA_MISMATCH',
        'Uploaded object metadata does not match the declaration.',
      );
    return dto(await this.r.ready(id, head.checksumSha256));
  }
  async list(taskId: string, userId: string) {
    await this.access(taskId, userId);
    return (await this.r.list(taskId)).map(dto);
  }
  async download(id: string, userId: string) {
    const a = await this.r.find(id);
    if (a?.status !== 'READY') throw notFound();
    await this.access(a.taskId, userId);
    return {
      url: await this.storage.presignDownload(a.storageKey, DOWNLOAD_URL_TTL_SECONDS),
      expiresIn: DOWNLOAD_URL_TTL_SECONDS,
    };
  }
  async remove(id: string, userId: string) {
    const a = await this.r.find(id);
    if (a === null) throw notFound();
    const m = await this.access(a.taskId, userId, true);
    if (a.uploadedBy !== userId && m.role !== 'ADMIN') throw forbidden();
    await this.storage.delete(a.storageKey);
    return this.r.remove(id);
  }
  async cleanup() {
    const stale = await this.r.stalePending(
      new Date(Date.now() - PENDING_ATTACHMENT_TTL_HOURS * 3600000),
    );
    for (const a of stale) {
      await this.storage.delete(a.storageKey);
      await this.r.remove(a.id);
    }
    return stale.length;
  }
}
