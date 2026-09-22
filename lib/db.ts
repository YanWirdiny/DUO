import { PrismaClient } from "@prisma/client";

// Stash the client on `globalThis` so hot-reload in dev doesn't spawn a new
// PrismaClient (and a new connection pool) on every module reload.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
