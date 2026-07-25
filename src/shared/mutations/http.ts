import type { Request } from 'express';
import type { MutationContext } from './executor.js';

export function mutationContext(
  request: Request,
  actorUserId: string | null,
  route: string,
  allowIdempotency = false,
): MutationContext {
  const idempotencyKey = allowIdempotency ? request.header('idempotency-key') : undefined;
  return {
    actorUserId,
    requestId: request.requestId,
    method: request.method,
    route,
    requestBody: request.body,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
  };
}
