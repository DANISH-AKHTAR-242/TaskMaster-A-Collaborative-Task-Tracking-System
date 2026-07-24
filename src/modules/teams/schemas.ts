import { z } from 'zod';

const teamRole = z.enum(['OWNER', 'ADMIN', 'MEMBER']);
export const createTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .min(3)
      .max(80),
  })
  .strict();
export const updateTeamSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .min(3)
      .max(80)
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export const changeTeamMemberSchema = z.object({ role: teamRole }).strict();
export const transferOwnershipSchema = z.object({ newOwnerUserId: z.uuid() }).strict();
export const createInvitationSchema = z
  .object({ email: z.email().max(320), role: teamRole.exclude(['OWNER']) })
  .strict();
export const acceptInvitationSchema = z.object({ token: z.string().min(32).max(200) }).strict();
