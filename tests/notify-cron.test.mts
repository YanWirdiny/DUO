import { after, before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { triggerSweep } from "../scripts/notify-cron.mjs";

const SECRET = "s".repeat(40);
const script = path.join(process.cwd(), "scripts", "notify-cron.mjs");
const run = promisify(execFile);

// A stand-in for the app: answers like the real cron route.
let server: Server;
let baseUrl: string;
const seen: { method?: string; url?: string; auth?: string }[] = [];

before(async () => {
  server = createServer((req, res) => {
    seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
    const ok = req.headers.authorization === `Bearer ${SECRET}`;
    res.writeHead(ok ? 200 : 401, { "Content-Type": "application/json" });
    res.end(JSON.stringify(ok ? { checked: 2, due: 1, sent: 1 } : { error: "Unauthorized" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${port}`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

describe("triggerSweep", () => {
  test("POSTs to the cron route with the bearer secret and returns the summary", async () => {
    const summary = await triggerSweep({ appUrl: baseUrl, secret: SECRET });
    assert.deepEqual(summary, { checked: 2, due: 1, sent: 1 });
    assert.deepEqual(seen.at(-1), { method: "POST", url: "/api/cron/notifications", auth: `Bearer ${SECRET}` });
  });

  test("throws with the server's message on a non-2xx", async () => {
    await assert.rejects(triggerSweep({ appUrl: baseUrl, secret: "wrong" }), /HTTP 401: Unauthorized/);
  });

  test("throws 'no details' when the error body isn't JSON", async () => {
    const fetchImpl = mock.fn(async () => new Response("<html>", { status: 502 }));
    await assert.rejects(triggerSweep({ appUrl: "https://duo.example.com", secret: SECRET, fetchImpl }), /HTTP 502: no details/);
  });

  test("refuses to send the secret over plain http to a remote host", async () => {
    const fetchImpl = mock.fn(async () => new Response("{}"));
    await assert.rejects(triggerSweep({ appUrl: "http://duo.example.com", secret: SECRET, fetchImpl }), /must use https/);
    assert.equal(fetchImpl.mock.callCount(), 0);
    // localhost over http is fine for local testing.
    const local = mock.fn(async () => new Response("{}"));
    await triggerSweep({ appUrl: "http://localhost:3000", secret: SECRET, fetchImpl: local });
    assert.equal(local.mock.callCount(), 1);
  });

  test("requires both settings", async () => {
    await assert.rejects(triggerSweep({ appUrl: undefined, secret: SECRET }), /APP_URL and CRON_SECRET/);
    await assert.rejects(triggerSweep({ appUrl: baseUrl, secret: "" }), /APP_URL and CRON_SECRET/);
  });
});

describe("notify-cron CLI", () => {
  const env = (extra: Record<string, string>) => {
    const clean = { ...process.env, ...extra };
    if (!("APP_URL" in extra)) delete clean.APP_URL;
    if (!("CRON_SECRET" in extra)) delete clean.CRON_SECRET;
    return clean;
  };

  test("prints the summary and exits 0", async () => {
    const { stdout } = await run(process.execPath, [script], { env: env({ APP_URL: baseUrl, CRON_SECRET: SECRET }) });
    assert.match(stdout, /\[notify-cron\] \{"checked":2,"due":1,"sent":1\}/);
  });

  test("importing the module (no script argument) doesn't trigger a sweep", async () => {
    const code = `await import(${JSON.stringify(pathToFileURL(script).href)});`;
    const { stdout, stderr } = await run(process.execPath, ["--input-type=module", "-e", code], { env: env({}) });
    assert.equal(stdout + stderr, "");
  });

  test("prints the error and exits 1", async () => {
    await assert.rejects(run(process.execPath, [script], { env: env({}) }), (err: { code: number; stderr: string }) => {
      assert.equal(err.code, 1);
      assert.match(err.stderr, /APP_URL and CRON_SECRET must be set/);
      return true;
    });
  });
});
