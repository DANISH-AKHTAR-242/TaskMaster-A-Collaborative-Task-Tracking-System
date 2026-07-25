import { getEnv } from './config/env.js';
import { createDatabaseClient, disconnectDatabase } from './infrastructure/database/prisma.js';
import { createLogger } from './infrastructure/observability/logger.js';
import { S3ObjectStorage } from './infrastructure/storage/s3-storage.js';
import { AttachmentRepository } from './modules/attachments/repository.js';
import { AttachmentService } from './modules/attachments/service.js';

const env = getEnv();
const prisma = createDatabaseClient(env.DATABASE_URL);
const logger = createLogger(env);
const attachments = new AttachmentService(
  new AttachmentRepository(prisma),
  new S3ObjectStorage(env),
  env,
);
const cleanupIntervalMs = 60 * 60 * 1000;
let cleanupPromise: Promise<void> | undefined;

function runAttachmentCleanup(): void {
  if (cleanupPromise !== undefined) return;
  cleanupPromise = attachments
    .cleanup()
    .then((removed) => {
      logger.info({ removed }, 'Stale pending attachment cleanup completed');
    })
    .catch((error: unknown) => {
      logger.error({ err: error }, 'Stale attachment cleanup failed');
    })
    .finally(() => {
      cleanupPromise = undefined;
    });
}

runAttachmentCleanup();
const cleanupTimer = setInterval(runAttachmentCleanup, cleanupIntervalMs);
logger.info({ notificationsEnabled: env.NOTIFICATIONS_ENABLED }, 'TaskMaster worker started');

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker shutdown started');
  clearInterval(cleanupTimer);
  await cleanupPromise;
  await disconnectDatabase(prisma);
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
