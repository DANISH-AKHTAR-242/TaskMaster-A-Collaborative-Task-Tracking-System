export interface FieldError {
  path: string;
  code: string;
  message: string;
}

export class AppError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly title: string,
    public readonly detail: string,
    public readonly errors?: FieldError[],
  ) {
    super(detail);
    this.name = 'AppError';
  }
}

export const notFound = (detail = 'The requested resource was not found.'): AppError =>
  new AppError(404, 'NOT_FOUND', 'Resource not found', detail);

export const forbidden = (): AppError =>
  new AppError(403, 'FORBIDDEN', 'Forbidden', 'You are not permitted to perform this operation.');

export const unauthorized = (): AppError =>
  new AppError(
    401,
    'UNAUTHORIZED',
    'Authentication required',
    'Authentication is missing or invalid.',
  );

export const conflict = (code: string, detail: string): AppError =>
  new AppError(409, code, 'Conflict', detail);
