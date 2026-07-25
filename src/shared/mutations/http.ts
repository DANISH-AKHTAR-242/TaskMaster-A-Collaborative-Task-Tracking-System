import type { Request } from 'express';
import type { MutationContext } from './executor.js';

export function mutationContext(
  request: Request,
  actorUserId: string | null,
  route: string,
  allowIdempotency = false,
): MutationContext {
  const idempotencyKey = allowIdempotency ? request.header('idempotency-key') : undefined;
  const queryStart = request.originalUrl.indexOf('?');
  const concreteRoute =
    queryStart === -1 ? request.originalUrl : request.originalUrl.slice(0, queryStart);
  return {
    actorUserId,
    requestId: request.requestId,
    method: request.method,
    route: allowIdempotency ? concreteRoute : route,
    requestBody: request.body,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
  };
}
