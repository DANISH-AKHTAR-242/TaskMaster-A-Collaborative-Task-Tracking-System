import { Router, type RequestHandler } from 'express';
import { validate } from '../../app/middleware/validate.js';
import type { Env } from '../../config/env.js';
import type { DatabaseClient, DatabaseHandle } from '../../infrastructure/database/prisma.js';
import { S3ObjectStorage } from '../../infrastructure/storage/s3-storage.js';
import { authUserId, stringParam } from '../../shared/utilities/http.js';
import { uuidParams } from '../../shared/validation/common.js';
import { mutationHandler } from '../../shared/mutations/handler.js';
import { AttachmentRepository } from './repository.js';
import { initializeUploadSchema } from './schemas.js';
import { AttachmentService } from './service.js';
export function attachmentRoutes(db: DatabaseClient, env: Env, auth: RequestHandler) {
  const tasks = Router(),
    attachments = Router(),
    storage = new S3ObjectStorage(env),
    service = (handle: DatabaseHandle) =>
      new AttachmentService(new AttachmentRepository(handle), storage, env),
    s = service(db);
  tasks.use(auth);
  attachments.use(auth);
  tasks.post(
    '/:taskId/attachments/uploads',
    validate('params', uuidParams('taskId')),
    validate('body', initializeUploadSchema),
    mutationHandler(
      db,
      '/api/v1/tasks/{taskId}/attachments/uploads',
      async (request, transaction) => {
        const taskId = stringParam(request, 'taskId');
        const initialized = await service(transaction).initialize(
          taskId,
          authUserId(request),
          request.body as never,
        );
        return {
          status: 201,
          body: { data: initialized },
          audit: {
            action: 'TASK_ATTACHMENT_UPLOAD_INITIALIZED',
            entityType: 'TASK_ATTACHMENT',
            entityId: initialized.attachment.id,
            metadata: { taskId },
          },
        };
      },
      { idempotent: true },
    ),
  );
  tasks.get('/:taskId/attachments', validate('params', uuidParams('taskId')), async (q, r) =>
    r.json({ data: await s.list(stringParam(q, 'taskId'), authUserId(q)) }),
  );
  attachments.post(
    '/:attachmentId/complete',
    validate('params', uuidParams('attachmentId')),
    mutationHandler(
      db,
      '/api/v1/attachments/{attachmentId}/complete',
      async (request, transaction) => {
        const attachmentId = stringParam(request, 'attachmentId');
        const attachment = await service(transaction).complete(attachmentId, authUserId(request));
        return {
          status: 200,
          body: { data: attachment },
          audit: {
            action: 'TASK_ATTACHMENT_COMPLETED',
            entityType: 'TASK_ATTACHMENT',
            entityId: attachmentId,
            metadata: { taskId: attachment.taskId },
          },
        };
      },
    ),
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
    mutationHandler(db, '/api/v1/attachments/{attachmentId}', async (request, transaction) => {
      const attachmentId = stringParam(request, 'attachmentId');
      const attachment = await service(transaction).remove(attachmentId, authUserId(request));
      return {
        status: 204,
        body: null,
        audit: {
          action: 'TASK_ATTACHMENT_DELETED',
          entityType: 'TASK_ATTACHMENT',
          entityId: attachmentId,
          metadata: { taskId: attachment.taskId },
        },
      };
    }),
  );
  return { tasks, attachments, service: s };
}
