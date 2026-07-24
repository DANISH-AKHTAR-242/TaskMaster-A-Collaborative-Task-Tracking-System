import type { RequestHandler } from 'express';
import type { DatabaseClient } from '../../infrastructure/database/prisma.js';
export function mutationAudit(db: DatabaseClient): RequestHandler {
  return (req, res, next) => {
    res.on('finish', () => {
      if (req.auth && ['POST', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) {
        void db.auditLog
          .create({
            data: {
              actorUserId: req.auth.userId,
              action: `${req.method} ${req.path}`,
              entityType: 'HTTP_MUTATION',
              requestId: req.requestId,
              metadata: { route: req.path, statusCode: res.statusCode },
            },
          })
          .catch((error: unknown) => {
            req.log.error({ err: error }, 'Audit write failed');
          });
      }
    });
    next();
  };
}
