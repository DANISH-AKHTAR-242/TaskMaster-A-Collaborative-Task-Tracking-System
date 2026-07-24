import type { RequestHandler } from 'express';
import type { ZodType } from 'zod';

type Location = 'body' | 'params' | 'query';

export function validate(location: Location, schema: ZodType): RequestHandler {
  return (request, _response, next) => {
    const parsed = schema.parse(request[location]);
    Object.defineProperty(request, location, { value: parsed, writable: true, configurable: true });
    next();
  };
}
