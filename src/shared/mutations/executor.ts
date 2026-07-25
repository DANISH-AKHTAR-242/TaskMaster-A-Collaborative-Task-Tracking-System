import { Prisma } from '../../generated/prisma/client.js';
import {
  inTransaction,
  type DatabaseHandle,
  type TransactionClient,
} from '../../infrastructure/database/prisma.js';
import { AppError, conflict } from '../errors/app-error.js';
import { normalizedRequestHash } from '../idempotency/request.js';

export interface MutationContext {
  actorUserId: string | null;
  requestId: string;
  method: string;
  route: string;
  idempotencyKey?: string;
  requestBody: unknown;
}

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId?: string;
  teamId?: string;
  metadata?: Prisma.InputJsonObject;
  actorUserId?: string;
}

export interface MutationResult {
  status: number;
  body: unknown;
  audit: AuditEntry;
}

export interface MutationResponse {
  status: number;
  body: Prisma.InputJsonValue;
  replayed: boolean;
}

function validateKey(key: string | undefined): void {
  if (key !== undefined && (key.trim().length === 0 || key.length > 200)) {
    throw new AppError(
      422,
      'INVALID_IDEMPOTENCY_KEY',
      'Request validation failed',
      'Idempotency-Key must contain between 1 and 200 characters.',
    );
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function executeMutation(
  database: DatabaseHandle,
  context: MutationContext,
  operation: (transaction: TransactionClient) => Promise<MutationResult>,
): Promise<MutationResponse> {
  validateKey(context.idempotencyKey);
  const requestHash = normalizedRequestHash(context.requestBody);

  return inTransaction(database, async (transaction) => {
    if (context.idempotencyKey !== undefined) {
      const lockIdentity = `${context.actorUserId ?? 'anonymous'}:${context.method}:${context.route}:${context.idempotencyKey}`;
      await transaction.$queryRaw(
        Prisma.sql`SELECT 1::integer AS locked
          FROM (SELECT pg_advisory_xact_lock(hashtextextended(${lockIdentity}, 0))) AS lock_acquired`,
      );
      const existing = await transaction.idempotencyKey.findFirst({
        where: {
          userId: context.actorUserId,
          key: context.idempotencyKey,
          method: context.method,
          route: context.route,
        },
        orderBy: { createdAt: 'desc' },
      });
      if (existing !== null && existing.expiresAt > new Date()) {
        if (existing.requestHash !== requestHash) {
          throw conflict(
            'IDEMPOTENCY_KEY_REUSED',
            'The idempotency key was reused with a different request.',
          );
        }
        if (existing.responseStatus === null || existing.responseBody === null) {
          throw conflict(
            'IDEMPOTENCY_REQUEST_IN_PROGRESS',
            'The original request is still running.',
          );
        }
        return {
          status: existing.responseStatus,
          body: existing.responseBody,
          replayed: true,
        };
      }
      if (existing !== null)
        await transaction.idempotencyKey.delete({ where: { id: existing.id } });
    }

    const result = await operation(transaction);
    const body = jsonValue(result.body);
    await transaction.auditLog.create({
      data: {
        actorUserId: result.audit.actorUserId ?? context.actorUserId,
        ...(result.audit.teamId === undefined ? {} : { teamId: result.audit.teamId }),
        action: result.audit.action,
        entityType: result.audit.entityType,
        ...(result.audit.entityId === undefined ? {} : { entityId: result.audit.entityId }),
        requestId: context.requestId,
        metadata: result.audit.metadata ?? {},
      },
    });

    if (context.idempotencyKey !== undefined) {
      await transaction.idempotencyKey.create({
        data: {
          userId: context.actorUserId,
          key: context.idempotencyKey,
          method: context.method,
          route: context.route,
          requestHash,
          responseStatus: result.status,
          responseBody: body,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }
    return { status: result.status, body, replayed: false };
  });
}
