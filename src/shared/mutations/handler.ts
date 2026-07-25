import type { RequestHandler } from 'express';
import type { DatabaseHandle, TransactionClient } from '../../infrastructure/database/prisma.js';
import { authUserId } from '../utilities/http.js';
import { executeMutation, type MutationResult } from './executor.js';
import { mutationContext } from './http.js';

export function mutationHandler(
  database: DatabaseHandle,
  route: string,
  operation: (
    request: Parameters<RequestHandler>[0],
    transaction: TransactionClient,
  ) => Promise<MutationResult>,
  options: { idempotent?: boolean; anonymous?: boolean } = {},
): RequestHandler {
  return async (request, response) => {
    const actorUserId = options.anonymous === true ? null : authUserId(request);
    const result = await executeMutation(
      database,
      mutationContext(request, actorUserId, route, options.idempotent === true),
      (transaction) => operation(request, transaction),
    );
    response.setHeader('Idempotency-Replayed', result.replayed ? 'true' : 'false');
    if (result.status === 204) response.status(204).send();
    else response.status(result.status).json(result.body);
  };
}
