import { z } from 'zod';
import { rfc3339Schema, versionSchema } from '../../shared/validation/common.js';
const status = z.enum(['OPEN', 'IN_PROGRESS', 'COMPLETED']);
export const createTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(20_000).nullable().optional(),
    dueAt: rfc3339Schema.nullable().optional(),
    assigneeId: z.uuid().nullable().optional(),
  })
  .strict();
export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(20_000).nullable().optional(),
    status: status.optional(),
    dueAt: rfc3339Schema.nullable().optional(),
    assigneeId: z.uuid().nullable().optional(),
    version: versionSchema,
  })
  .strict();
export const taskQuerySchema = z
  .object({
    status: z
      .string()
      .transform((v) => v.split(','))
      .pipe(z.array(status).min(1))
      .optional(),
    assigneeId: z.uuid().optional(),
    assignee: z.literal('me').optional(),
    unassigned: z
      .enum(['true', 'false'])
      .transform((v) => v === 'true')
      .optional(),
    createdBy: z.uuid().optional(),
    dueBefore: rfc3339Schema.optional(),
    dueAfter: rfc3339Schema.optional(),
    search: z.string().trim().min(2).max(200).optional(),
    sort: z.enum(['createdAt', 'updatedAt', 'dueAt', 'title', 'status']).default('createdAt'),
    order: z.enum(['asc', 'desc']).default('desc'),
    cursor: z.string().max(2000).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
