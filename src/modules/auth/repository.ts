import { inTransaction, type DatabaseHandle } from '../../infrastructure/database/prisma.js';

export class AuthRepository {
  public constructor(private readonly database: DatabaseHandle) {}

  public createSession(input: {
    userId: string;
    tokenFamilyId: string;
    refreshTokenHash: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }) {
    return this.database.authSession.create({ data: input });
  }

  public findByTokenHash(hash: string) {
    return this.database.authSession.findUnique({
      where: { refreshTokenHash: hash },
      include: { user: true },
    });
  }

  public findActiveSession(id: string, userId: string) {
    return this.database.authSession.findFirst({
      where: {
        id,
        userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { deletedAt: null },
      },
    });
  }

  public findSession(id: string) {
    return this.database.authSession.findUnique({ where: { id } });
  }

  public rotate(
    sessionId: string,
    input: { refreshTokenHash: string; expiresAt: Date; userAgent?: string; ipAddress?: string },
  ) {
    return inTransaction(this.database, async (transaction) => {
      const current = await transaction.authSession.findUnique({ where: { id: sessionId } });
      if (current?.revokedAt !== null || current.expiresAt <= new Date()) return null;
      const replacement = await transaction.authSession.create({
        data: {
          userId: current.userId,
          tokenFamilyId: current.tokenFamilyId,
          refreshTokenHash: input.refreshTokenHash,
          expiresAt: input.expiresAt,
          ...(input.userAgent === undefined ? {} : { userAgent: input.userAgent }),
          ...(input.ipAddress === undefined ? {} : { ipAddress: input.ipAddress }),
        },
      });
      const updated = await transaction.authSession.updateMany({
        where: { id: current.id, revokedAt: null, replacedById: null },
        data: { revokedAt: new Date(), replacedById: replacement.id },
      });
      if (updated.count !== 1) throw new Error('Concurrent refresh rotation');
      return replacement;
    });
  }

  public revokeFamily(tokenFamilyId: string) {
    return this.database.authSession.updateMany({
      where: { tokenFamilyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  public revokeSession(id: string) {
    return this.database.authSession.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  public revokeAll(userId: string) {
    return this.database.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
