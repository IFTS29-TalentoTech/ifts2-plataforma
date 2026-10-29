import { PrismaClient } from '@prisma/client';

export type Db = PrismaClient;

export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } });
}
