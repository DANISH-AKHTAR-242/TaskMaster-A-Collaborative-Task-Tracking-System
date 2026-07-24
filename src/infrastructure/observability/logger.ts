import pino, { type Logger } from 'pino';
import type { Env } from '../../config/env.js';

export function createLogger(env: Pick<Env, 'LOG_LEVEL'>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        '*.password',
        '*.refreshToken',
        '*.invitationToken',
        '*.providerApiKey',
        '*.prompt',
      ],
      censor: '[REDACTED]',
    },
  });
}
