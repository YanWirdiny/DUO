import { afterEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import webpush from "web-push";
import {
  browserPushEnv,
  currentSubscription,
  disablePush,
  enablePush,
  pushSupport,
  urlBase64ToUint8Array,
  type PushEnv,
  type SubscriptionLike,
} from "@/lib/push-client";

const VAPID = webpush.generateVAPIDKeys();

function fakeSubscription(endpoint = "https://fcm.googleapis.com/fcm/send/abc"): SubscriptionLike & {
  unsubscribe: ReturnType<typeof mock.fn>;
} {
  return {
    endpoint,
    toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: mock.fn(async () => true),
  };
}

function jsonResponse(status: number, body: unknown) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
}

/** A browser that supports push, with knobs for each step of the flow. */
function fakeEnv(opts: {
  permission?: NotificationPermission;
  requestResult?: NotificationPermission;
  existing?: SubscriptionLike | null;
  noRegistration?: boolean;
  ready?: Promise<unknown>;
  subscribeThrows?: boolean;
  response?: Response;
  fetchThrows?: boolean;
} = {}) {
  const created = fakeSubscription("https://fcm.googleapis.com/fcm/send/new");
  const subscribe = mock.fn(async () => {
    if (opts.subscribeThrows) throw new Error("AbortError");
    return created;
  });
  const registration = {
    pushManager: { getSubscription: async () => opts.existing ?? null, subscribe },
  };
  const fetchFn = mock.fn(async () => {
    if (opts.fetchThrows) throw new TypeError("offline");
    return opts.response ?? jsonResponse(200, { ok: true });
  });
  const env: PushEnv = {
    serviceWorker: {
      ready: (opts.ready ?? Promise.resolve(registration)) as never,
      getRegistration: async () => (opts.noRegistration ? undefined : registration),
    },
    Notification: {
      permission: opts.permission ?? "default",
      requestPermission: async () => opts.requestResult ?? "granted",
    },
    hasPushManager: true,
    fetch: fetchFn as unknown as typeof fetch,
  };
  return { env, subscribe, fetchFn, created };
}

afterEach(() => mock.restoreAll());

describe("urlBase64ToUint8Array", () => {
  test("decodes a real VAPID public key to its 65 raw bytes", () => {
    const bytes = urlBase64ToUint8Array(VAPID.publicKey);
    assert.equal(bytes.length, 65);
    assert.equal(bytes[0], 0x04); // uncompressed EC point
    assert.deepEqual(Buffer.from(bytes), Buffer.from(VAPID.publicKey, "base64url"));
  });

  test("handles - and _ and missing padding", () => {
    assert.deepEqual([...urlBase64ToUint8Array("-_8")], [0xfb, 0xff]);
    assert.deepEqual([...urlBase64ToUint8Array("AAAA")], [0, 0, 0]);
  });
});

describe("pushSupport", () => {
  test("unsupported when any piece is missing", () => {
    const { env } = fakeEnv();
    assert.equal(pushSupport({ ...env, serviceWorker: undefined }), "unsupported");
    assert.equal(pushSupport({ ...env, Notification: undefined }), "unsupported");
    assert.equal(pushSupport({ ...env, hasPushManager: false }), "unsupported");
  });

  test("otherwise the current permission", () => {
    for (const permission of ["default", "granted", "denied"] as const) {
      assert.equal(pushSupport(fakeEnv({ permission }).env), permission);
    }
  });
});

describe("currentSubscription", () => {
  test("the registration's subscription, or null without one", async () => {
    const existing = fakeSubscription();
    assert.equal(await currentSubscription(fakeEnv({ existing }).env), existing);
    assert.equal(await currentSubscription(fakeEnv().env), null);
    assert.equal(await currentSubscription(fakeEnv({ noRegistration: true }).env), null);
    assert.equal(await currentSubscription({ ...fakeEnv().env, serviceWorker: undefined }), null);
  });
});

describe("enablePush", () => {
  test("subscribes with the VAPID key and posts toJSON() to the API", async () => {
    const { env, subscribe, fetchFn, created } = fakeEnv();
    assert.deepEqual(await enablePush(env, VAPID.publicKey), { ok: true });

    const [options] = subscribe.mock.calls[0].arguments as unknown as [{ userVisibleOnly: boolean; applicationServerKey: Uint8Array }];
    assert.equal(options.userVisibleOnly, true);
    assert.deepEqual(Buffer.from(options.applicationServerKey), Buffer.from(VAPID.publicKey, "base64url"));

    const [url, init] = fetchFn.mock.calls[0].arguments as unknown as [string, RequestInit];
    assert.equal(url, "/api/notifications/subscriptions");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body as string), created.toJSON());
  });

  test("reuses an existing browser subscription instead of creating another", async () => {
    const existing = fakeSubscription();
    const { env, subscribe, fetchFn } = fakeEnv({ existing });
    assert.deepEqual(await enablePush(env, VAPID.publicKey), { ok: true });
    assert.equal(subscribe.mock.callCount(), 0);
    const [, init] = fetchFn.mock.calls[0].arguments as unknown as [string, RequestInit];
    assert.equal(JSON.parse(init.body as string).endpoint, existing.endpoint);
  });

  test("explains when the browser can't do push", async () => {
    const { env } = fakeEnv();
    const result = await enablePush({ ...env, hasPushManager: false }, VAPID.publicKey);
    assert.deepEqual(result, {
      ok: false,
      error: "This browser can't receive notifications. On iPhone, add Duo to your Home Screen first.",
    });
  });

  test("stops if permission isn't granted", async () => {
    for (const requestResult of ["denied", "default"] as const) {
      const { env, subscribe } = fakeEnv({ requestResult });
      const result = await enablePush(env, VAPID.publicKey);
      assert.equal(result.ok, false);
      assert.match(!result.ok ? result.error : "", /blocked/);
      assert.equal(subscribe.mock.callCount(), 0);
    }
  });

  test("gives up if the service worker never becomes ready", async () => {
    const { env } = fakeEnv({ ready: new Promise(() => {}) });
    const result = await enablePush(env, VAPID.publicKey, 10);
    assert.deepEqual(result, { ok: false, error: "The app's service worker isn't running, so notifications can't be set up." });
  });

  test("a rejected service worker or failed subscribe is reported, not thrown", async () => {
    const rejected = fakeEnv({ ready: Promise.reject(new Error("sw failed")) });
    assert.deepEqual(await enablePush(rejected.env, VAPID.publicKey, 10), {
      ok: false,
      error: "Couldn't turn on notifications.",
    });

    const { env } = fakeEnv({ subscribeThrows: true });
    assert.deepEqual(await enablePush(env, VAPID.publicKey), { ok: false, error: "Couldn't turn on notifications." });
  });

  test("if the server refuses, the browser subscription is undone and the server's message shown", async () => {
    const { env, created } = fakeEnv({ response: jsonResponse(409, { error: "Too many devices." }) });
    assert.deepEqual(await enablePush(env, VAPID.publicKey), { ok: false, error: "Too many devices." });
    assert.equal(created.unsubscribe.mock.callCount(), 1);

    const noMessage = fakeEnv({ response: jsonResponse(500, "<html>") });
    assert.deepEqual(await enablePush(noMessage.env, VAPID.publicKey), { ok: false, error: "Couldn't turn on notifications." });
    const nonString = fakeEnv({ response: jsonResponse(400, { error: 42 }) });
    assert.deepEqual(await enablePush(nonString.env, VAPID.publicKey), { ok: false, error: "Couldn't turn on notifications." });
  });

  test("network failure is reported", async () => {
    const { env } = fakeEnv({ fetchThrows: true });
    assert.deepEqual(await enablePush(env, VAPID.publicKey), { ok: false, error: "Couldn't turn on notifications." });
  });
});

describe("disablePush", () => {
  test("deletes on the server, then unsubscribes the browser", async () => {
    const existing = fakeSubscription();
    const { env, fetchFn } = fakeEnv({ existing });
    assert.deepEqual(await disablePush(env), { ok: true });
    const [url, init] = fetchFn.mock.calls[0].arguments as unknown as [string, RequestInit];
    assert.equal(url, "/api/notifications/subscriptions");
    assert.equal(init.method, "DELETE");
    assert.deepEqual(JSON.parse(init.body as string), { endpoint: existing.endpoint });
    assert.equal((existing.unsubscribe as ReturnType<typeof mock.fn>).mock.callCount(), 1);
  });

  test("nothing to do without a subscription", async () => {
    const { env, fetchFn } = fakeEnv();
    assert.deepEqual(await disablePush(env), { ok: true });
    assert.equal(fetchFn.mock.callCount(), 0);
  });

  test("keeps the browser subscription if the server call fails", async () => {
    const existing = fakeSubscription();
    const { env } = fakeEnv({ existing, response: jsonResponse(401, { error: "Not authenticated" }) });
    assert.deepEqual(await disablePush(env), { ok: false, error: "Not authenticated" });
    assert.equal((existing.unsubscribe as ReturnType<typeof mock.fn>).mock.callCount(), 0);

    const plain = fakeEnv({ existing: fakeSubscription(), response: jsonResponse(500, "") });
    assert.deepEqual(await disablePush(plain.env), { ok: false, error: "Couldn't turn off notifications." });
  });

  test("network failure is reported", async () => {
    const { env } = fakeEnv({ existing: fakeSubscription(), fetchThrows: true });
    assert.deepEqual(await disablePush(env), { ok: false, error: "Couldn't turn off notifications." });
  });
});

describe("browserPushEnv", () => {
  const g = globalThis as Record<string, unknown>;
  const saved = { window: g.window, navigatorDesc: Object.getOwnPropertyDescriptor(globalThis, "navigator") };

  function setGlobals(win: Record<string, unknown>, nav: Record<string, unknown>) {
    g.window = win;
    Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
  }

  afterEach(() => {
    g.window = saved.window;
    if (saved.navigatorDesc) Object.defineProperty(globalThis, "navigator", saved.navigatorDesc);
  });

  test("reads the real globals when push is available", async () => {
    const serviceWorker = { ready: Promise.resolve(), getRegistration: async () => undefined };
    const NotificationCtor = { permission: "granted", requestPermission: async () => "granted" };
    const fetchFn = mock.fn(async () => jsonResponse(200, {}));
    const win = { Notification: NotificationCtor, PushManager: function PushManager() {}, fetch: fetchFn };
    setGlobals(win, { serviceWorker });

    const env = browserPushEnv();
    assert.equal(env.serviceWorker, serviceWorker);
    assert.equal(env.Notification, NotificationCtor);
    assert.equal(env.hasPushManager, true);
    await env.fetch("/x");
    assert.equal(fetchFn.mock.calls[0].this, win); // bound, so it isn't an "Illegal invocation"
  });

  test("leaves missing APIs undefined", () => {
    setGlobals({ fetch: async () => jsonResponse(200, {}) }, {});
    const env = browserPushEnv();
    assert.equal(env.serviceWorker, undefined);
    assert.equal(env.Notification, undefined);
    assert.equal(env.hasPushManager, false);
    assert.equal(pushSupport(env), "unsupported");
  });
});
