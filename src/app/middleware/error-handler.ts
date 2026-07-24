import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  void _next;
  let appError: AppError;
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = new AppError(
      422,
      'VALIDATION_ERROR',
      'Request validation failed',
      'One or more request fields are invalid.',
      error.issues.map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code,
        message: issue.message,
      })),
    );
  } else if (error instanceof SyntaxError && 'body' in error) {
    appError = new AppError(
      400,
      'MALFORMED_JSON',
      'Malformed request',
      'The JSON request body is invalid.',
    );
  } else {
    request.log.error({ err: error }, 'Unhandled request error');
    appError = new AppError(
      500,
      'INTERNAL_ERROR',
      'Internal server error',
      'An unexpected error occurred.',
    );
  }

  response
    .status(appError.status)
    .type('application/problem+json')
    .json({
      type: `https://taskmaster.example/problems/${appError.code.toLowerCase().replaceAll('_', '-')}`,
      title: appError.title,
      status: appError.status,
      detail: appError.detail,
      instance: request.originalUrl,
      code: appError.code,
      requestId: request.requestId,
      ...(appError.errors === undefined ? {} : { errors: appError.errors }),
    });
};
