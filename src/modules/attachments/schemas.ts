import { z } from 'zod';
export const initializeUploadSchema = z
  .object({
    filename: z.string().trim().min(1).max(255),
    contentType: z.string().trim().min(1).max(150),
    sizeBytes: z.number().int().positive(),
  })
  .strict();
