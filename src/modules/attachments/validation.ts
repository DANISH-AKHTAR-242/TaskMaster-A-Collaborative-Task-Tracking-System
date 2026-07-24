import { AppError } from '../../shared/errors/app-error.js';
export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/pdf',
  'application/json',
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
export function validateAttachment(contentType: string, sizeBytes: number, max: number): void {
  if (sizeBytes > max)
    throw new AppError(
      413,
      'ATTACHMENT_TOO_LARGE',
      'Attachment too large',
      `Attachment exceeds the ${max} byte limit.`,
    );
  if (!ALLOWED_MIME_TYPES.has(contentType))
    throw new AppError(
      415,
      'UNSUPPORTED_ATTACHMENT_TYPE',
      'Unsupported media type',
      'The attachment content type is not allowed.',
    );
}
