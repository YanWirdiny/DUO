import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  focusOrOpen,
  registerPushHandlers,
  safeAppPath,
  toNotification,
  type NotificationClickEventLike,
  type PushEventLike,
  type ServiceWorkerScopeLike,
} from "@/worker/push";

const ORIGIN = "https://duo.example.com";

/** A fake service worker global that records listeners, notifications and windows. */
function fakeScope(openUrls: string[] = []) {
  const listeners: Record<string, (event: unknown) => void> = {};
  const windows = openUrls.map((url) => ({ url, focus: mock.fn(async () => "focused") }));
  const scope = {
    location: { origin: ORIGIN },
    registration: { showNotification: mock.fn(async () => {}) },
    clients: {
      matchAll: mock.fn(async () => windows),
      openWindow: mock.fn(async (url: string) => `opened ${url}`),
    },
    addEventListener: (type: string, listener: (event: unknown) => void) => {
      listeners[type] = listener;
    },
  };
  return { scope: scope as unknown as ServiceWorkerScopeLike, raw: scope, listeners, windows };
}

function pushEvent(data: PushEventLike["data"]) {
  const waits: Promise<unknown>[] = [];
  return { event: { data, waitUntil: (p: Promise<unknown>) => waits.push(p) } as PushEventLike, waits };
}

describe("safeAppPath", () => {
  test("keeps same-origin app paths", () => {
    assert.equal(safeAppPath("/"), "/");
    assert.equal(safeAppPath("/log/2026-10-08"), "/log/2026-10-08");
  });

  test("anything that could leave the app becomes /", () => {
    for (const url of [
      "https://evil.example.com",
      "//evil.example.com/x",
      "/\\evil.example.com",
      "javascript:alert(1)",
      "log/2026-10-08",
      "",
      null,
      undefined,
      42,
      { url: "/" },
      "/" + "a".repeat(200),
    ]) {
      assert.equal(safeAppPath(url), "/", String(url));
    }
  });
});

describe("toNotification", () => {
  test("maps a reminder payload to showNotification arguments", () => {
    const data = { json: () => ({ title: "Gym day", body: "Push Day today.", url: "/log/2026-10-08", tag: "GYM_DAY" }) };
    assert.deepEqual(toNotification(data), {
      title: "Gym day",
      options: {
        body: "Push Day today.",
        tag: "GYM_DAY",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: "/log/2026-10-08" },
      },
    });
  });

  test("falls back to a generic notification for empty, non-JSON or hostile payloads", () => {
    const generic = { title: "Duo", body: "You have a new reminder.", tag: undefined, url: "/" };
    const cases: PushEventLike["data"][] = [
      null,
      { json: () => null },
      { json: () => "a string" },
      {
        json: () => {
          throw new SyntaxError("not JSON");
        },
      },
      { json: () => ({ title: "", body: 5, tag: {}, url: "https://evil.example.com" }) },
    ];
    for (const data of cases) {
      const { title, options } = toNotification(data);
      assert.deepEqual({ title, body: options.body, tag: options.tag, url: options.data.url }, generic);
    }
  });

  test("truncates oversized text", () => {
    const { title, options } = toNotification({
      json: () => ({ title: "t".repeat(500), body: "b".repeat(500), tag: "x".repeat(100) }),
    });
    assert.equal(title.length, 80);
    assert.equal(options.body.length, 240);
    assert.equal(options.tag?.length, 32);
  });
});

describe("focusOrOpen", () => {
  test("focuses a tab already on that page", async () => {
    const { scope, raw, windows } = fakeScope([`${ORIGIN}/`, `${ORIGIN}/log/2026-10-08`]);
    assert.equal(await focusOrOpen(scope, "/log/2026-10-08"), "focused");
    assert.equal(windows[1].focus.mock.callCount(), 1);
    assert.equal(raw.clients.openWindow.mock.callCount(), 0);
    assert.deepEqual(raw.clients.matchAll.mock.calls[0].arguments, [{ type: "window", includeUncontrolled: true }]);
  });

  test("otherwise opens a new one, only ever on our origin", async () => {
    const { scope } = fakeScope([`${ORIGIN}/history`]);
    assert.equal(await focusOrOpen(scope, "/log/2026-10-08"), `opened ${ORIGIN}/log/2026-10-08`);
    assert.equal(await focusOrOpen(scope, "//evil.example.com"), `opened ${ORIGIN}/`);
  });
});

describe("registerPushHandlers", () => {
  test("push → showNotification inside waitUntil", async () => {
    const { scope, raw, listeners } = fakeScope();
    registerPushHandlers(scope);
    const { event, waits } = pushEvent({ json: () => ({ title: "Don't forget to log", body: "b", url: "/log/x", tag: "LOG_REMINDER" }) });
    listeners.push(event);
    await Promise.all(waits);
    assert.equal(waits.length, 1);
    const [title, options] = raw.registration.showNotification.mock.calls[0].arguments as unknown as [string, { data: { url: string } }];
    assert.equal(title, "Don't forget to log");
    assert.equal(options.data.url, "/log/x");
  });

  test("notificationclick closes the notification and opens its (sanitised) url", async () => {
    const { scope, raw, listeners } = fakeScope();
    registerPushHandlers(scope);
    for (const [data, expected] of [
      [{ url: "/log/2026-10-08" }, `${ORIGIN}/log/2026-10-08`],
      [{ url: "https://evil.example.com" }, `${ORIGIN}/`],
      [undefined, `${ORIGIN}/`],
    ] as const) {
      const waits: Promise<unknown>[] = [];
      const close = mock.fn();
      const event: NotificationClickEventLike = { notification: { data, close }, waitUntil: (p) => waits.push(p) };
      listeners.notificationclick(event);
      await Promise.all(waits);
      assert.equal(close.mock.callCount(), 1);
      assert.equal(raw.clients.openWindow.mock.calls.at(-1)?.arguments[0], expected);
    }
  });
});

describe("worker entry", () => {
  test("registers the handlers on the service worker global", async () => {
    const { scope, listeners } = fakeScope();
    const g = globalThis as Record<string, unknown>;
    const saved = g.self;
    g.self = scope;
    try {
      await import("@/worker/index");
      assert.deepEqual(Object.keys(listeners).sort(), ["notificationclick", "push"]);
    } finally {
      g.self = saved;
    }
  });
});
