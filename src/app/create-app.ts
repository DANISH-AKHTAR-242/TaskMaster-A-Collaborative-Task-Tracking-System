import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { API_PREFIX, MAX_JSON_BODY_BYTES } from '../config/constants.js';
import type { Env } from '../config/env.js';
import type { DatabaseClient } from '../infrastructure/database/prisma.js';
import { createLogger } from '../infrastructure/observability/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { requestId } from './middleware/request-id.js';
import { requestLogger } from './middleware/request-logger.js';
import { generalRateLimit } from './middleware/rate-limit.js';
import { mutationAudit } from './middleware/mutation-audit.js';
import { createRoutes } from './routes.js';

export interface AppDependencies {
  env: Env;
  database: DatabaseClient;
}

export function createApp({ env, database }: AppDependencies): Express {
  const app = express();
  const logger = createLogger(env);
  const allowedOrigins = new Set(env.CLIENT_ORIGINS.split(',').map((origin) => origin.trim()));

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(requestLogger(logger));
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        callback(null, origin === undefined || allowedOrigins.has(origin));
      },
    }),
  );
  app.use(express.json({ limit: MAX_JSON_BODY_BYTES, type: 'application/json' }));
  app.use(cookieParser());
  app.use(generalRateLimit);
  app.use(mutationAudit(database));
  app.use(API_PREFIX, createRoutes(database, env));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
