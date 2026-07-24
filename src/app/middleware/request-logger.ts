import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

export function requestLogger(rootLogger: Logger): RequestHandler {
  return (request, response, next) => {
    const startedAt = performance.now();
    request.log = rootLogger.child({ requestId: request.requestId });
    response.on('finish', () => {
      request.log.info({
        method: request.method,
        route: request.path,
        statusCode: response.statusCode,
        durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
        userId: request.auth?.userId,
        sessionId: request.auth?.sessionId,
        clientIp: request.ip,
        userAgent: request.get('user-agent'),
      });
    });
    next();
  };
}
