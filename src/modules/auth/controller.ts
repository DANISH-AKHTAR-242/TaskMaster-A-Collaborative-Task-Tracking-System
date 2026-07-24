import type { CookieOptions, RequestHandler } from 'express';
import type { Env } from '../../config/env.js';
import { unauthorized } from '../../shared/errors/app-error.js';
import type { AuthService } from './service.js';

function metadata(request: Parameters<RequestHandler>[0]) {
  const userAgent = request.get('user-agent');
  return {
    ...(userAgent === undefined ? {} : { userAgent }),
    ...(request.ip === undefined ? {} : { ipAddress: request.ip }),
  };
}

function readCookie(request: Parameters<RequestHandler>[0], name: string): string | undefined {
  const cookies: unknown = request.cookies;
  if (typeof cookies !== 'object' || cookies === null) return undefined;
  const value = (cookies as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : undefined;
}

export class AuthController {
  private readonly cookieOptions: CookieOptions;

  public constructor(
    private readonly service: AuthService,
    private readonly env: Env,
  ) {
    this.cookieOptions = {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
      maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
    };
  }

  private setCookie(response: Parameters<RequestHandler>[1], token: string): void {
    response.cookie(this.env.REFRESH_COOKIE_NAME, token, this.cookieOptions);
  }

  public readonly register: RequestHandler = async (request, response) => {
    const result = await this.service.register(request.body as never, metadata(request));
    this.setCookie(response, result.refreshToken);
    response.status(201).json({ data: { user: result.user, accessToken: result.accessToken } });
  };

  public readonly login: RequestHandler = async (request, response) => {
    const result = await this.service.login(request.body as never, metadata(request));
    this.setCookie(response, result.refreshToken);
    response.json({ data: { user: result.user, accessToken: result.accessToken } });
  };

  public readonly refresh: RequestHandler = async (request, response) => {
    const result = await this.service.refresh(
      readCookie(request, this.env.REFRESH_COOKIE_NAME),
      metadata(request),
    );
    this.setCookie(response, result.refreshToken);
    response.json({ data: { accessToken: result.accessToken } });
  };

  public readonly logout: RequestHandler = async (request, response) => {
    try {
      await this.service.logout(
        readCookie(request, this.env.REFRESH_COOKIE_NAME),
        request.auth?.sessionId,
      );
    } finally {
      response.clearCookie(this.env.REFRESH_COOKIE_NAME, this.cookieOptions);
    }
    response.status(204).send();
  };

  public readonly logoutAll: RequestHandler = async (request, response) => {
    if (request.auth === undefined) throw unauthorized();
    await this.service.logoutAll(request.auth.userId);
    response.clearCookie(this.env.REFRESH_COOKIE_NAME, this.cookieOptions).status(204).send();
  };
}
