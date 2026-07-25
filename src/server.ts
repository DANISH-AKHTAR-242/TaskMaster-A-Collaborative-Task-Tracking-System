import { createServer } from 'node:http';
import { createApp } from './app/create-app.js';
import { getEnv } from './config/env.js';
import { createDatabaseClient, disconnectDatabase } from './infrastructure/database/prisma.js';
import { createLogger } from './infrastructure/observability/logger.js';

const env = getEnv();
const prisma = createDatabaseClient(env.DATABASE_URL);
const logger = createLogger(env);
const server = createServer(createApp({ env, database: prisma }));

server.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'TaskMaster API listening');
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');
  server.close(() => {
    void disconnectDatabase(prisma).then(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  shutdown('SIGINT');
});
