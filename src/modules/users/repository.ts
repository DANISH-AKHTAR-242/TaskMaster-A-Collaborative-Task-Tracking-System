import type { DatabaseClient } from '../../infrastructure/database/prisma.js';

export class UserRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public findActiveById(id: string) {
    return this.database.user.findFirst({ where: { id, deletedAt: null } });
  }

  public findActiveByEmail(email: string) {
    return this.database.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
    });
  }

  public create(input: { email: string; passwordHash: string; displayName: string }) {
    return this.database.user.create({ data: input });
  }

  public updateProfile(id: string, input: { displayName?: string; avatarUrl?: string | null }) {
    return this.database.user.update({ where: { id }, data: input });
  }
}
