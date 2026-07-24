import type { RequestHandler } from 'express';
import { unauthorized } from '../../shared/errors/app-error.js';
import type { UserService } from './service.js';

export class UserController {
  public constructor(private readonly service: UserService) {}

  public readonly me: RequestHandler = async (request, response) => {
    if (request.auth === undefined) throw unauthorized();
    response.json({ data: await this.service.me(request.auth.userId) });
  };

  public readonly update: RequestHandler = async (request, response) => {
    if (request.auth === undefined) throw unauthorized();
    response.json({ data: await this.service.update(request.auth.userId, request.body as never) });
  };
}
