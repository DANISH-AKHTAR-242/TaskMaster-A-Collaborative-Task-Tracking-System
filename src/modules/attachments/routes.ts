import { Router, type RequestHandler } from 'express';
import { validate } from '../../app/middleware/validate.js';
import type { Env } from '../../config/env.js';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';
import { S3ObjectStorage } from '../../infrastructure/storage/s3-storage.js';
import { authUserId, stringParam } from '../../shared/utilities/http.js';
import { uuidParams } from '../../shared/validation/common.js';
import { AttachmentRepository } from './repository.js';
import { initializeUploadSchema } from './schemas.js';
import { AttachmentService } from './service.js';
export function attachmentRoutes(db: DatabaseClient, env: Env, auth: RequestHandler) {
  const tasks = Router(),
    attachments = Router(),
    s = new AttachmentService(new AttachmentRepository(db), new S3ObjectStorage(env), env);
  tasks.use(auth);
  attachments.use(auth);
  tasks.post(
    '/:taskId/attachments/uploads',
    validate('params', uuidParams('taskId')),
    validate('body', initializeUploadSchema),
    async (q, r) =>
      r.status(201).json({
        data: await s.initialize(stringParam(q, 'taskId'), authUserId(q), q.body as never),
      }),
  );
  tasks.get('/:taskId/attachments', validate('params', uuidParams('taskId')), async (q, r) =>
    r.json({ data: await s.list(stringParam(q, 'taskId'), authUserId(q)) }),
  );
  attachments.post(
    '/:attachmentId/complete',
    validate('params', uuidParams('attachmentId')),
    async (q, r) =>
      r.json({ data: await s.complete(stringParam(q, 'attachmentId'), authUserId(q)) }),
  );
  attachments.post(
    '/:attachmentId/download-url',
    validate('params', uuidParams('attachmentId')),
    async (q, r) =>
      r.json({ data: await s.download(stringParam(q, 'attachmentId'), authUserId(q)) }),
  );
  attachments.delete(
    '/:attachmentId',
    validate('params', uuidParams('attachmentId')),
    async (q, r) => {
      await s.remove(stringParam(q, 'attachmentId'), authUserId(q));
      r.status(204).send();
    },
  );
  return { tasks, attachments, service: s };
}
