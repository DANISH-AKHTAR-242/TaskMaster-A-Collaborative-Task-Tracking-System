import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const requestId: RequestHandler = (request, response, next) => {
  const supplied = request.header('x-request-id');
  request.requestId =
    supplied !== undefined && UUID_PATTERN.test(supplied) ? supplied : randomUUID();
  response.setHeader('X-Request-Id', request.requestId);
  next();
};
