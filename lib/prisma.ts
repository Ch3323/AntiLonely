import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

// One PrismaClient per server process. In dev, Next hot-reloads modules, which
// would otherwise open a new connection pool on every edit — so the adapter and
// client are cached on globalThis. Checking `instanceof PrismaClient` ensures a
// stale client is replaced automatically after `prisma generate` updates the schema.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaAdapter?: PrismaPg;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set — copy .env.example to .env and fill it in.");
  }
  // DATABASE_URL is Supabase's transaction pooler (port 6543).
  const adapter =
    globalForPrisma.prismaAdapter ?? new PrismaPg({ connectionString });
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prismaAdapter = adapter;
  }
  return new PrismaClient({ adapter });
}

export const prisma =
  globalForPrisma.prisma instanceof PrismaClient
    ? globalForPrisma.prisma
    : createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
