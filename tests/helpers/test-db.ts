// Throwaway in-memory Postgres (PGlite) for tests, migrated with the real
// prisma/migrations SQL. Never touches the .pglite-data dev database.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const migrationsDir = path.join(process.cwd(), "prisma", "migrations");

/** Starts the test DB and points DATABASE_URL at it. Must run before anything
 * imports `@/lib/db`, since the Prisma client reads the URL on first use. */
export async function startTestDb(port = 5434) {
  const db = new PGlite();
  await db.waitReady;

  const migrations = readdirSync(migrationsDir)
    .filter((name) => statSync(path.join(migrationsDir, name)).isDirectory())
    .sort();
  for (const name of migrations) {
    await db.exec(readFileSync(path.join(migrationsDir, name, "migration.sql"), "utf8"));
  }

  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 10 });
  await server.start();

  process.env.DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable&connection_limit=1&pgbouncer=true`;

  return {
    async stop() {
      await server.stop();
      await db.close();
    },
  };
}
