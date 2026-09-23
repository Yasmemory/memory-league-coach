import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalDb = globalThis as unknown as { db?: PrismaClient };
export function db() {
  if (globalDb.db) return globalDb.db;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing");
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  if (process.env.NODE_ENV !== "production") globalDb.db = client;
  return client;
}
