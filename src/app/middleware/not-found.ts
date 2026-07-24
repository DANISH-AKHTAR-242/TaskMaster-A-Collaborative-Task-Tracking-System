import type { RequestHandler } from 'express';
import { notFound } from '../../shared/errors/app-error.js';

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(notFound());
};
