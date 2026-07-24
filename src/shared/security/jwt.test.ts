import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { JwtService } from './jwt.js';

describe('JWT access tokens', () => {
  it('signs and verifies issuer, audience, subject and session', async () => {
    const keys = await generateKeyPair('RS256', { extractable: true });
    const service = new JwtService({
      JWT_PRIVATE_KEY_BASE64: Buffer.from(await exportPKCS8(keys.privateKey)).toString('base64'),
      JWT_PUBLIC_KEY_BASE64: Buffer.from(await exportSPKI(keys.publicKey)).toString('base64'),
      JWT_ISSUER: 'taskmaster-api',
      JWT_AUDIENCE: 'taskmaster-client',
      ACCESS_TOKEN_TTL_SECONDS: 900,
    });
    const claims = { userId: crypto.randomUUID(), sessionId: crypto.randomUUID() };
    await expect(service.verify(await service.sign(claims))).resolves.toEqual(claims);
  });

  it('rejects a token with the wrong audience', async () => {
    const keys = await generateKeyPair('RS256', { extractable: true });
    const privateKey = Buffer.from(await exportPKCS8(keys.privateKey)).toString('base64');
    const publicKey = Buffer.from(await exportSPKI(keys.publicKey)).toString('base64');
    const signer = new JwtService({
      JWT_PRIVATE_KEY_BASE64: privateKey,
      JWT_PUBLIC_KEY_BASE64: publicKey,
      JWT_ISSUER: 'taskmaster-api',
      JWT_AUDIENCE: 'wrong-client',
      ACCESS_TOKEN_TTL_SECONDS: 900,
    });
    const verifier = new JwtService({
      JWT_PRIVATE_KEY_BASE64: privateKey,
      JWT_PUBLIC_KEY_BASE64: publicKey,
      JWT_ISSUER: 'taskmaster-api',
      JWT_AUDIENCE: 'taskmaster-client',
      ACCESS_TOKEN_TTL_SECONDS: 900,
    });
    await expect(
      verifier.verify(
        await signer.sign({ userId: crypto.randomUUID(), sessionId: crypto.randomUUID() }),
      ),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
