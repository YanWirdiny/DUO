// HTTP-level tests for the notification route handlers, the proxy rules they
// rely on, and the settings page. The session is mocked (cookies() only exists
// inside a real Next request); everything else — zod, Prisma, the DB — is real.
import { after, afterEach, before, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { isValidElement, type ReactElement } from "react";
import webpush from "web-push";
import { startTestDb } from "./helpers/test-db";

const testDb = await startTestDb(5436);

const VAPID = webpush.generateVAPIDKeys();
const CRON_SECRET = "c".repeat(48);
const ENV = {
  VAPID_PUBLIC_KEY: VAPID.publicKey,
  VAPID_PRIVATE_KEY: VAPID.privateKey,
  VAPID_SUBJECT: "mailto:test@example.com",
  CRON_SECRET,
  JWT_SECRET: "test-jwt-secret-for-proxy-tests-only",
};
Object.assign(process.env, ENV);

let sessionUserId: string | null = null;
const { prisma } = await import("@/lib/db");
mock.module("@/lib/auth", {
  namedExports: {
    getSessionUserId: async () => sessionUserId,
    getCurrentUser: async () => (sessionUserId ? prisma.user.findUnique({ where: { id: sessionUserId } }) : null),
  },
});

const preferencesRoute = await import("@/app/api/notifications/preferences/route");
const subscriptionsRoute = await import("@/app/api/notifications/subscriptions/route");
const cronRoute = await import("@/app/api/cron/notifications/route");
const { default: SettingsPage } = await import("@/app/(app)/settings/page");
const { NotificationSettings } = await import("@/components/settings/NotificationSettings");
const { proxy } = await import("@/proxy");
const { signSessionToken, SESSION_COOKIE_NAME } = await import("@/lib/session");
const { NOTIFICATIONS } = await import("@/lib/notification-rules");
const { NextRequest } = await import("next/server");
const { weekdayOf, todayInTz } = await import("@/lib/dates");

let userCount = 0;
let endpointCount = 0;

async function createUser() {
  return prisma.user.create({
    data: { username: `route${++userCount}`, passwordHash: "x", displayName: `Route ${userCount}`, timezone: "UTC" },
  });
}

function subscriptionJson(overrides: Record<string, unknown> = {}) {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/route-${++endpointCount}`,
    expirationTime: null,
    keys: { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) },
    ...overrides,
  };
}

function jsonRequest(url: string, method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Temporarily unsets env vars for one test. */
async function withoutEnv(keys: (keyof typeof ENV)[], fn: () => Promise<void>) {
  for (const key of keys) delete process.env[key];
  try {
    await fn();
  } finally {
    Object.assign(process.env, ENV);
  }
}

before(() => {
  sessionUserId = null;
});

afterEach(() => {
  sessionUserId = null;
});

after(async () => {
  await prisma.$disconnect();
  await testDb.stop();
});

describe("PATCH /api/notifications/preferences", () => {
  const patch = (body: unknown) => preferencesRoute.PATCH(jsonRequest("/api/notifications/preferences", "PATCH", body));

  test("401 without a session", async () => {
    const res = await patch({ gymDayEnabled: false });
    assert.equal(res.status, 401);
  });

  test("400 for invalid bodies: bad JSON, empty, unknown keys, bad times, wrong types", async () => {
    sessionUserId = (await createUser()).id;
    for (const body of [
      "{not json",
      {},
      { gymDayEnabled: false, isAdmin: true },
      { userId: "someone-else", gymDayEnabled: false },
      { gymDayTime: "24:00" },
      { gymDayTime: "8:00" },
      { logReminderTime: "20:00:00" },
      { gymDayEnabled: "yes" },
      { logReminderMinute: 5 },
    ]) {
      const res = await patch(body);
      assert.equal(res.status, 400, JSON.stringify(body));
      assert.deepEqual(await res.json(), { error: "Invalid notification settings." });
    }
  });

  test("saves a subset and returns the full settings as HH:MM", async () => {
    sessionUserId = (await createUser()).id;
    let res = await patch({ gymDayTime: "07:30", logReminderEnabled: false });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      preferences: { gymDayEnabled: true, gymDayTime: "07:30", logReminderEnabled: false, logReminderTime: "20:00" },
    });

    res = await patch({ logReminderTime: "21:15", gymDayEnabled: false });
    assert.deepEqual((await res.json()).preferences, {
      gymDayEnabled: false,
      gymDayTime: "07:30",
      logReminderEnabled: false,
      logReminderTime: "21:15",
    });
    const row = await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: sessionUserId } });
    assert.equal(row.gymDayMinute, 7 * 60 + 30);
    assert.equal(row.logReminderMinute, 21 * 60 + 15);
  });
});

describe("POST /api/notifications/subscriptions", () => {
  const post = (body: unknown) => subscriptionsRoute.POST(jsonRequest("/api/notifications/subscriptions", "POST", body));

  test("401 without a session", async () => {
    assert.equal((await post(subscriptionJson())).status, 401);
  });

  test("503 when the server has no VAPID keys", async () => {
    sessionUserId = (await createUser()).id;
    await withoutEnv(["VAPID_PRIVATE_KEY"], async () => {
      const res = await post(subscriptionJson());
      assert.equal(res.status, 503);
    });
    assert.equal(await prisma.pushSubscription.count({ where: { userId: sessionUserId! } }), 0);
  });

  test("400 for endpoints outside the push-service allowlist (SSRF) and malformed keys", async () => {
    sessionUserId = (await createUser()).id;
    for (const body of [
      "{oops",
      subscriptionJson({ endpoint: "https://169.254.169.254/latest/meta-data" }),
      subscriptionJson({ endpoint: "http://fcm.googleapis.com/fcm/send/x" }),
      subscriptionJson({ endpoint: "https://internal.local/push" }),
      subscriptionJson({ keys: { p256dh: "short", auth: "A".repeat(22) } }),
      subscriptionJson({ keys: { p256dh: "B" + "A".repeat(86), auth: "nope" } }),
      subscriptionJson({ keys: { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22), extra: "x" } }),
      subscriptionJson({ userId: "someone-else" }),
      subscriptionJson({ expirationTime: "soon" }),
      { endpoint: "https://fcm.googleapis.com/fcm/send/x" },
    ]) {
      const res = await post(body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
    assert.equal(await prisma.pushSubscription.count({ where: { userId: sessionUserId } }), 0);
  });

  test("stores the browser's PushSubscription.toJSON() for the session user", async () => {
    const user = await createUser();
    sessionUserId = user.id;
    const body = subscriptionJson();
    const res = await post(body);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: body.endpoint } });
    assert.equal(row.userId, user.id);
    assert.equal(row.auth, "A".repeat(22));
  });

  test("400 (indistinguishable from invalid) when taking over another user's endpoint without its keys", async () => {
    const victim = await createUser();
    const sub = subscriptionJson();
    await prisma.pushSubscription.create({
      data: { userId: victim.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    sessionUserId = (await createUser()).id;
    const res = await post({ ...sub, keys: { ...sub.keys, auth: "Z".repeat(22) } });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "Invalid push subscription." });
    assert.equal((await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: sub.endpoint } })).userId, victim.id);

    // The real browser (same keys) can still move it, e.g. after switching accounts.
    assert.equal((await post(sub)).status, 200);
    assert.equal((await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: sub.endpoint } })).userId, sessionUserId);
  });

  test("409 once the device limit is reached", async () => {
    sessionUserId = (await createUser()).id;
    for (let i = 0; i < NOTIFICATIONS.MAX_SUBSCRIPTIONS_PER_USER; i++) assert.equal((await post(subscriptionJson())).status, 200);
    const res = await post(subscriptionJson());
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /already on for 5 devices/);
  });
});

describe("DELETE /api/notifications/subscriptions", () => {
  const del = (body: unknown) =>
    subscriptionsRoute.DELETE(jsonRequest("/api/notifications/subscriptions", "DELETE", body));

  test("401 without a session, 400 for a bad body", async () => {
    assert.equal((await del({ endpoint: "x" })).status, 401);
    sessionUserId = (await createUser()).id;
    for (const body of ["nope", {}, { endpoint: "" }, { endpoint: "x".repeat(1025) }, { endpoint: "x", userId: "y" }]) {
      assert.equal((await del(body)).status, 400, JSON.stringify(body));
    }
  });

  test("removes the caller's device but can't touch another user's", async () => {
    const owner = await createUser();
    const other = await createUser();
    const sub = subscriptionJson();
    await prisma.pushSubscription.create({
      data: { userId: owner.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });

    sessionUserId = other.id;
    let res = await del({ endpoint: sub.endpoint });
    assert.equal(res.status, 200); // same answer either way: no probing for other users' endpoints
    assert.equal(await prisma.pushSubscription.count({ where: { endpoint: sub.endpoint } }), 1);

    sessionUserId = owner.id;
    res = await del({ endpoint: sub.endpoint });
    assert.deepEqual(await res.json(), { ok: true });
    assert.equal(await prisma.pushSubscription.count({ where: { endpoint: sub.endpoint } }), 0);
  });
});

describe("POST /api/cron/notifications", () => {
  const cron = (authorization?: string) =>
    cronRoute.POST(
      new Request("http://localhost/api/cron/notifications", {
        method: "POST",
        headers: authorization ? { Authorization: authorization } : {},
      })
    );

  afterEach(() => mock.restoreAll());

  test("401 without the secret or with a wrong one", async () => {
    for (const header of [undefined, "Bearer wrong", `Basic ${CRON_SECRET}`, CRON_SECRET]) {
      const res = await cron(header);
      assert.equal(res.status, 401, String(header));
      assert.deepEqual(await res.json(), { error: "Unauthorized" });
    }
  });

  test("stays closed (401) and warns when CRON_SECRET is unset", async () => {
    const warn = mock.method(console, "warn", () => {});
    await withoutEnv(["CRON_SECRET"], async () => {
      assert.equal((await cron(`Bearer ${CRON_SECRET}`)).status, 401);
      assert.equal((await cron("Bearer ")).status, 401);
    });
    assert.equal(warn.mock.callCount(), 2);
  });

  test("503 when VAPID keys are missing", async () => {
    await withoutEnv(["VAPID_PUBLIC_KEY"], async () => {
      assert.equal((await cron(`Bearer ${CRON_SECRET}`)).status, 503);
    });
  });

  test("runs the sweep through web-push and returns only counts", async () => {
    await prisma.pushSubscription.deleteMany();
    const user = await createUser();
    // A gym day today whose log reminder is due right now, in UTC.
    await prisma.scheduleDay.create({ data: { userId: user.id, weekday: weekdayOf(todayInTz("UTC")), isGymDay: true } });
    const minute = new Date().getUTCHours() * 60 + new Date().getUTCMinutes();
    await prisma.notificationPreference.create({
      data: { userId: user.id, gymDayEnabled: false, logReminderMinute: minute },
    });
    const sub = subscriptionJson();
    await prisma.pushSubscription.create({
      data: { userId: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
    const send = mock.method(webpush, "sendNotification", async () => ({ statusCode: 201, body: "", headers: {} }));

    const res = await cron(`Bearer ${CRON_SECRET}`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { checked: 1, due: 1, sent: 1, failed: 0, removed: 0, errors: 0 });
    assert.equal(send.mock.callCount(), 1);
    assert.equal(send.mock.calls[0].arguments[0]?.endpoint, sub.endpoint);
  });
});

describe("proxy", () => {
  const run = (path: string, cookie?: string) =>
    proxy(new NextRequest(`http://localhost${path}`, { headers: cookie ? { cookie } : {} }));
  const passes = (res: Response) => res.headers.get("x-middleware-next") === "1";

  test("the cron endpoint and generated SW chunks are reachable without a session", async () => {
    for (const path of [
      "/api/cron/notifications",
      "/worker-a1B2_c3.js",
      "/workbox-4f2d9c.js",
      "/swe-worker-5c72df.js",
      "/fallback-abc.js",
      "/sw.js",
      "/login",
      "/icons/icon-192.png",
    ]) {
      assert.ok(passes(await run(path)), path);
    }
  });

  test("everything else in the feature still needs a session", async () => {
    for (const path of ["/api/notifications/preferences", "/api/notifications/subscriptions", "/api/cron/notifications/x"]) {
      const res = await run(path);
      assert.equal(res.status, 401, path);
    }
    for (const path of ["/settings", "/worker-../settings.js", "/worker-abc.js/x", "/worker-abc.json"]) {
      const res = await run(path);
      assert.equal(res.status, 307, path);
      assert.match(res.headers.get("location")!, /\/login\?next=/);
    }
  });

  test("a signed-in user passes, and is bounced from /login to /", async () => {
    const cookie = `${SESSION_COOKIE_NAME}=${await signSessionToken("user-1")}`;
    assert.ok(passes(await run("/settings", cookie)));
    const res = await run("/login", cookie);
    assert.equal(res.status, 307);
    assert.equal(new URL(res.headers.get("location")!).pathname, "/");
  });
});

describe("settings page", () => {
  /** Finds the first element of `type` in a server-component tree. */
  function find(node: unknown, type: unknown): ReactElement<Record<string, unknown>> | null {
    if (Array.isArray(node)) {
      for (const child of node) {
        const hit = find(child, type);
        if (hit) return hit;
      }
      return null;
    }
    if (!isValidElement(node)) return null;
    if (node.type === type) return node as ReactElement<Record<string, unknown>>;
    return find((node.props as { children?: unknown }).children, type);
  }

  test("renders nothing without a user", async () => {
    assert.equal(await SettingsPage(), null);
  });

  test("passes the saved preferences, timezone and public VAPID key (never the private one)", async () => {
    const user = await createUser();
    sessionUserId = user.id;
    await prisma.notificationPreference.create({ data: { userId: user.id, gymDayMinute: 6 * 60 + 45 } });

    const settings = find(await SettingsPage(), NotificationSettings);
    assert.ok(settings);
    assert.deepEqual(settings.props, {
      vapidPublicKey: VAPID.publicKey,
      preferences: { gymDayEnabled: true, gymDayTime: "06:45", logReminderEnabled: true, logReminderTime: "20:00" },
      timezone: "UTC",
    });
    assert.ok(!JSON.stringify(settings.props).includes(VAPID.privateKey));
  });

  test("passes a null key when VAPID isn't configured", async () => {
    sessionUserId = (await createUser()).id;
    await withoutEnv(["VAPID_SUBJECT"], async () => {
      const settings = find(await SettingsPage(), NotificationSettings);
      assert.equal(settings?.props.vapidPublicKey, null);
    });
  });
});
