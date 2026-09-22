// Local-only dev database: an embedded Postgres-compatible server (PGlite) exposed
// over a real TCP/wire-protocol socket, so `prisma migrate`/the app can point a normal
// DATABASE_URL at it without Docker or an admin-rights Postgres install.
// Not used in production — Railway provides real managed Postgres there.
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dir, "..", ".pglite-data");

const db = new PGlite(dataDir);
await db.waitReady;

const server = new PGLiteSocketServer({ db, port: 5433, host: "127.0.0.1", maxConnections: 10 });
await server.start();

console.log("Local dev Postgres ready at postgresql://postgres:postgres@127.0.0.1:5433/postgres");

process.on("SIGINT", async () => {
  await server.stop();
  await db.close();
  process.exit(0);
});
