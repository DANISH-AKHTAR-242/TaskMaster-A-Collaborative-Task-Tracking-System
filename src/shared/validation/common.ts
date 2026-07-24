import { z } from 'zod';

export const uuidSchema = z.uuid();
export const uuidParams = (name: string) => z.object({ [name]: uuidSchema }).strict();
export const versionSchema = z.number().int().positive();
export const rfc3339Schema = z.iso.datetime({ offset: true });
