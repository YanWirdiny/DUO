// Push + notification-click handling for the service worker. Written against
// minimal structural types (not the "webworker" lib, which clashes with the DOM
// lib the rest of the app compiles with) so it can be unit-tested in Node.

export type NotificationOptionsLike = {
  body: string;
  tag?: string;
  icon: string;
  badge: string;
  data: { url: string };
};

type WindowClientLike = { url: string; focus(): Promise<unknown> };

export type ServiceWorkerScopeLike = {
  location: { origin: string };
  registration: { showNotification(title: string, options: NotificationOptionsLike): Promise<void> };
  clients: {
    matchAll(options: { type: "window"; includeUncontrolled: boolean }): Promise<readonly WindowClientLike[]>;
    openWindow(url: string): Promise<unknown>;
  };
  addEventListener(type: "push", listener: (event: PushEventLike) => void): void;
  addEventListener(type: "notificationclick", listener: (event: NotificationClickEventLike) => void): void;
};

export type PushEventLike = {
  data: { json(): unknown } | null;
  waitUntil(promise: Promise<unknown>): void;
};

export type NotificationClickEventLike = {
  notification: { data?: unknown; close(): void };
  waitUntil(promise: Promise<unknown>): void;
};

const ICON = "/icons/icon-192.png";
const FALLBACK = { title: "Duo", body: "You have a new reminder." };

/** Only same-origin app paths are opened on click ("/log/…"); anything else → "/". */
export function safeAppPath(url: unknown): string {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//") || url.startsWith("/\\")) return "/";
  return url.length > 200 ? "/" : url;
}

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 ? value.slice(0, max) : null;
}

/** Turns a push message into showNotification() arguments, tolerating bad payloads. */
export function toNotification(data: PushEventLike["data"]): { title: string; options: NotificationOptionsLike } {
  let payload: Record<string, unknown> = {};
  try {
    const parsed = data?.json();
    if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
  } catch {
    // Not JSON: fall back to a generic notification rather than showing nothing.
  }
  return {
    title: text(payload.title, 80) ?? FALLBACK.title,
    options: {
      body: text(payload.body, 240) ?? FALLBACK.body,
      tag: text(payload.tag, 32) ?? undefined,
      icon: ICON,
      badge: ICON,
      data: { url: safeAppPath(payload.url) },
    },
  };
}

/** Focuses a tab already showing the target page, otherwise opens one. */
export async function focusOrOpen(scope: ServiceWorkerScopeLike, path: string): Promise<unknown> {
  const target = new URL(safeAppPath(path), scope.location.origin).href;
  const windows = await scope.clients.matchAll({ type: "window", includeUncontrolled: true });
  const existing = windows.find((w) => w.url === target);
  return existing ? existing.focus() : scope.clients.openWindow(target);
}

/** Wires the handlers onto the service worker global. */
export function registerPushHandlers(scope: ServiceWorkerScopeLike): void {
  scope.addEventListener("push", (event) => {
    const { title, options } = toNotification(event.data);
    event.waitUntil(scope.registration.showNotification(title, options));
  });

  scope.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = (event.notification.data as { url?: unknown } | undefined)?.url;
    event.waitUntil(focusOrOpen(scope, safeAppPath(url)));
  });
}
