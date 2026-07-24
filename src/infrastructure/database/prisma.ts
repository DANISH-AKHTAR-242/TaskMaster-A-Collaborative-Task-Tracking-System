import { PrismaPg } from '@prisma/adapter-pg';
import { getEnv } from '../../config/env.js';
import { PrismaClient } from '../../generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });

export const prisma = new PrismaClient({ adapter });

export type DatabaseClient = typeof prisma;

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
