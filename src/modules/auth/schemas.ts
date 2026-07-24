import { z } from 'zod';

export const registerSchema = z
  .object({
    email: z.email().max(320),
    password: z.string().min(12).max(128),
    displayName: z.string().trim().min(1).max(120),
  })
  .strict();

export const loginSchema = z
  .object({ email: z.email().max(320), password: z.string().min(1).max(128) })
  .strict();
