import { z } from 'zod';
export const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(20_000).nullable().optional(),
  })
  .strict();
export const updateProjectSchema = createProjectSchema
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export const addProjectMemberSchema = z
  .object({ userId: z.uuid(), role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']) })
  .strict();
export const updateProjectMemberSchema = z
  .object({ role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']) })
  .strict();
