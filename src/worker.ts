import { getEnv } from './config/env.js';
import { disconnectDatabase } from './infrastructure/database/prisma.js';
import { createLogger } from './infrastructure/observability/logger.js';

const env = getEnv();
const logger = createLogger(env);
logger.info(
  { notificationsEnabled: env.NOTIFICATIONS_ENABLED },
  env.NOTIFICATIONS_ENABLED
    ? 'TaskMaster worker started'
    : 'TaskMaster worker idle; notifications disabled',
);

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Worker shutdown started');
  await disconnectDatabase();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
