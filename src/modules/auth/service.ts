import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.js';
import { AppError, conflict, unauthorized } from '../../shared/errors/app-error.js';
import { normalizeEmail, randomOpaqueToken, sha256 } from '../../shared/security/hash.js';
import type { JwtService } from '../../shared/security/jwt.js';
import { hashPassword, verifyPassword } from '../../shared/security/password.js';
import { toUserDto, type UserDto } from '../users/dto.js';
import type { UserRepository } from '../users/repository.js';
import type { AuthRepository } from './repository.js';

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: UserDto;
}

function isUniqueError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

export class AuthService {
  public constructor(
    private readonly users: UserRepository,
    private readonly sessions: AuthRepository,
    private readonly jwt: JwtService,
    private readonly env: Pick<Env, 'PASSWORD_PEPPER' | 'REFRESH_TOKEN_TTL_SECONDS'>,
  ) {}

  private expiry(): Date {
    return new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_SECONDS * 1000);
  }

  private async issueSession(
    user: Awaited<ReturnType<UserRepository['create']>>,
    metadata: SessionMetadata,
  ): Promise<AuthResult> {
    const refreshToken = randomOpaqueToken();
    const session = await this.sessions.createSession({
      userId: user.id,
      tokenFamilyId: randomUUID(),
      refreshTokenHash: sha256(refreshToken),
      expiresAt: this.expiry(),
      ...metadata,
    });
    return {
      accessToken: await this.jwt.sign({ userId: user.id, sessionId: session.id }),
      refreshToken,
      user: toUserDto(user),
    };
  }

  public async register(
    input: { email: string; password: string; displayName: string },
    metadata: SessionMetadata,
  ): Promise<AuthResult> {
    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password, this.env.PASSWORD_PEPPER);
    try {
      const user = await this.users.create({
        email,
        passwordHash,
        displayName: input.displayName.trim(),
      });
      return await this.issueSession(user, metadata);
    } catch (error) {
      if (isUniqueError(error))
        throw conflict('EMAIL_ALREADY_REGISTERED', 'An active account already uses this email.');
      throw error;
    }
  }

  public async login(
    input: { email: string; password: string },
    metadata: SessionMetadata,
  ): Promise<AuthResult> {
    const user = await this.users.findActiveByEmail(normalizeEmail(input.email));
    if (
      user === null ||
      !(await verifyPassword(user.passwordHash, input.password, this.env.PASSWORD_PEPPER))
    ) {
      throw new AppError(
        401,
        'INVALID_CREDENTIALS',
        'Invalid credentials',
        'Email or password is incorrect.',
      );
    }
    return this.issueSession(user, metadata);
  }

  public async refresh(
    refreshToken: string | undefined,
    metadata: SessionMetadata,
  ): Promise<Omit<AuthResult, 'user'>> {
    if (refreshToken === undefined) throw unauthorized();
    const current = await this.sessions.findByTokenHash(sha256(refreshToken));
    if (current === null || current.expiresAt <= new Date() || current.user.deletedAt !== null)
      throw unauthorized();
    if (current.revokedAt !== null || current.replacedById !== null) {
      await this.sessions.revokeFamily(current.tokenFamilyId);
      throw new AppError(
        401,
        'REFRESH_TOKEN_REUSED',
        'Authentication required',
        'The session family has been revoked.',
      );
    }
    const replacementToken = randomOpaqueToken();
    const replacement = await this.sessions.rotate(current.id, {
      refreshTokenHash: sha256(replacementToken),
      expiresAt: this.expiry(),
      ...metadata,
    });
    if (replacement === null) throw unauthorized();
    return {
      accessToken: await this.jwt.sign({ userId: current.userId, sessionId: replacement.id }),
      refreshToken: replacementToken,
    };
  }

  public async logout(
    refreshToken: string | undefined,
    sessionId: string | undefined,
  ): Promise<void> {
    if (refreshToken !== undefined) {
      const session = await this.sessions.findByTokenHash(sha256(refreshToken));
      if (session !== null) await this.sessions.revokeSession(session.id);
    } else if (sessionId !== undefined) {
      await this.sessions.revokeSession(sessionId);
    }
  }

  public async logoutAll(userId: string): Promise<void> {
    await this.sessions.revokeAll(userId);
  }
}
