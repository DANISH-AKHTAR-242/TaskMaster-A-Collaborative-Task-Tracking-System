import { importPKCS8, importSPKI, jwtVerify, SignJWT, type CryptoKey } from 'jose';
import type { Env } from '../../config/env.js';
import { unauthorized } from '../errors/app-error.js';

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
}

export class JwtService {
  private privateKeyPromise?: Promise<CryptoKey>;
  private publicKeyPromise?: Promise<CryptoKey>;

  public constructor(
    private readonly config: Pick<
      Env,
      | 'JWT_PRIVATE_KEY_BASE64'
      | 'JWT_PUBLIC_KEY_BASE64'
      | 'JWT_ISSUER'
      | 'JWT_AUDIENCE'
      | 'ACCESS_TOKEN_TTL_SECONDS'
    >,
  ) {}

  private getPrivateKey(): Promise<CryptoKey> {
    this.privateKeyPromise ??= importPKCS8(
      Buffer.from(this.config.JWT_PRIVATE_KEY_BASE64, 'base64').toString('utf8'),
      'RS256',
    );
    return this.privateKeyPromise;
  }

  private getPublicKey(): Promise<CryptoKey> {
    this.publicKeyPromise ??= importSPKI(
      Buffer.from(this.config.JWT_PUBLIC_KEY_BASE64, 'base64').toString('utf8'),
      'RS256',
    );
    return this.publicKeyPromise;
  }

  public async sign(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ sid: claims.sessionId })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .setSubject(claims.userId)
      .setIssuer(this.config.JWT_ISSUER)
      .setAudience(this.config.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.config.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(await this.getPrivateKey());
  }

  public async verify(token: string): Promise<AccessTokenClaims> {
    try {
      const { payload } = await jwtVerify(token, await this.getPublicKey(), {
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
        algorithms: ['RS256'],
      });
      if (typeof payload.sub !== 'string' || typeof payload['sid'] !== 'string')
        throw unauthorized();
      return { userId: payload.sub, sessionId: payload['sid'] };
    } catch {
      throw unauthorized();
    }
  }
}
