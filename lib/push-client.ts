// Browser-side Web Push helpers used by the settings screen. The browser APIs
// come in through a `PushEnv` so the logic runs in Node tests with fakes.

export type SubscriptionLike = {
  endpoint: string;
  toJSON(): unknown;
  unsubscribe(): Promise<boolean>;
};

type RegistrationLike = {
  pushManager: {
    getSubscription(): Promise<SubscriptionLike | null>;
    subscribe(options: { userVisibleOnly: true; applicationServerKey: Uint8Array }): Promise<SubscriptionLike>;
  };
};

export type PushEnv = {
  serviceWorker?: { ready: Promise<RegistrationLike>; getRegistration(): Promise<RegistrationLike | undefined> };
  Notification?: { permission: NotificationPermission; requestPermission(): Promise<NotificationPermission> };
  hasPushManager: boolean;
  fetch: typeof fetch;
};

export type PushSupport = "unsupported" | NotificationPermission;

export type PushResult = { ok: true } | { ok: false; error: string };

const SUBSCRIPTIONS_API = "/api/notifications/subscriptions";
/** How long to wait for the service worker before giving up (it's off in `next dev`). */
export const SW_READY_TIMEOUT_MS = 10_000;

/** The real browser globals. */
export function browserPushEnv(): PushEnv {
  return {
    serviceWorker: "serviceWorker" in navigator ? (navigator.serviceWorker as unknown as PushEnv["serviceWorker"]) : undefined,
    Notification: "Notification" in window ? window.Notification : undefined,
    hasPushManager: "PushManager" in window,
    fetch: window.fetch.bind(window),
  };
}

/** VAPID public keys are base64url; pushManager.subscribe wants raw bytes. */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const base64 = (base64Url + "=".repeat((4 - (base64Url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** "unsupported" (e.g. iPhone Safari outside an installed app), else the permission state. */
export function pushSupport(env: PushEnv): PushSupport {
  if (!env.serviceWorker || !env.Notification || !env.hasPushManager) return "unsupported";
  return env.Notification.permission;
}

/** This browser's current subscription, if notifications are on here. */
export async function currentSubscription(env: PushEnv): Promise<SubscriptionLike | null> {
  const registration = await env.serviceWorker?.getRegistration();
  return registration ? registration.pushManager.getSubscription() : null;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof data.error === "string" ? data.error : fallback;
}

/** Asks for permission, subscribes this browser, and registers it with the server. */
export async function enablePush(env: PushEnv, vapidPublicKey: string, timeoutMs = SW_READY_TIMEOUT_MS): Promise<PushResult> {
  if (pushSupport(env) === "unsupported") {
    return { ok: false, error: "This browser can't receive notifications. On iPhone, add Duo to your Home Screen first." };
  }

  const permission = await env.Notification!.requestPermission();
  if (permission !== "granted") {
    return { ok: false, error: "Notifications are blocked. Allow them for Duo in your browser settings." };
  }

  try {
    const registration = await withTimeout(env.serviceWorker!.ready, timeoutMs);
    if (!registration) return { ok: false, error: "The app's service worker isn't running, so notifications can't be set up." };

    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));

    const res = await env.fetch(SUBSCRIPTIONS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscription.toJSON()),
    });
    if (!res.ok) {
      // Keep browser and server in agreement: no server record → no browser subscription.
      await subscription.unsubscribe();
      return { ok: false, error: await errorFrom(res, "Couldn't turn on notifications.") };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't turn on notifications." };
  }
}

/** Removes this browser's subscription from the server, then from the browser. */
export async function disablePush(env: PushEnv): Promise<PushResult> {
  try {
    const subscription = await currentSubscription(env);
    if (!subscription) return { ok: true };
    const res = await env.fetch(SUBSCRIPTIONS_API, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    if (!res.ok) return { ok: false, error: await errorFrom(res, "Couldn't turn off notifications.") };
    await subscription.unsubscribe();
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't turn off notifications." };
  }
}
