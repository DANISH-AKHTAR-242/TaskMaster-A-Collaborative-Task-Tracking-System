import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import type { Prisma } from '../../generated/prisma/client.js';

export function createDatabaseClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  return new PrismaClient({ adapter });
}

export type DatabaseClient = PrismaClient;
export type TransactionClient = Prisma.TransactionClient;
export type DatabaseHandle = DatabaseClient | TransactionClient;

export function inTransaction<T>(
  database: DatabaseHandle,
  operation: (transaction: TransactionClient) => Promise<T>,
): Promise<T> {
  if ('$transaction' in database) return database.$transaction(operation);
  return operation(database);
}

export async function disconnectDatabase(database: DatabaseClient): Promise<void> {
  await database.$disconnect();
}
