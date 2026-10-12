// Server-only Web Push: VAPID config, subscription validation, and sending.
import webpush from "web-push";
import type { PushPayload } from "@/lib/notification-rules";

export type VapidConfig = { publicKey: string; privateKey: string; subject: string };

/** A stored subscription: the push-service URL plus the browser's encryption keys. */
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** `gone` = the push service says the subscription no longer exists (delete it). */
export type SendResult = "sent" | "gone" | "failed";

/**
 * Push services browsers actually hand out endpoints for. The server POSTs to
 * whatever endpoint a client registers, so anything else is refused: otherwise a
 * logged-in user could point the server at internal hosts (SSRF).
 * Entries starting with "." match that domain's subdomains only.
 */
export const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com", // Chrome, Android, Opera, Samsung
  "updates.push.services.mozilla.com", // Firefox
  "web.push.apple.com", // Safari / iOS home-screen apps
  ".push.apple.com",
  ".notify.windows.com", // Edge (WNS)
];

const MAX_ENDPOINT_LENGTH = 1024;
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/;

/** True for an https URL on an allowlisted push service, with no port or credentials. */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  if (endpoint.length > MAX_ENDPOINT_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((allowed) => (allowed.startsWith(".") ? host.endsWith(allowed) : host === allowed));
}

/** p256dh is an uncompressed P-256 point (65 bytes → 87 base64url chars). */
export function isValidP256dh(key: string): boolean {
  return BASE64URL.test(key) && key.replace(/=+$/, "").length === 87;
}

/** auth is a 16-byte secret (→ 22 base64url chars). */
export function isValidAuthSecret(key: string): boolean {
  return BASE64URL.test(key) && key.replace(/=+$/, "").length === 22;
}

/**
 * Reads VAPID keys from the environment. Returns null (feature off) unless all
 * three are present and well-formed, so a half-configured deploy fails closed
 * instead of throwing inside web-push at send time.
 */
export function getVapidConfig(env: Record<string, string | undefined> = process.env): VapidConfig | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject) return null;
  if (!isValidP256dh(publicKey)) return null;
  if (!BASE64URL.test(privateKey) || privateKey.replace(/=+$/, "").length !== 43) return null;
  if (!/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

/** How long the push service keeps an undelivered reminder (device offline). */
const PUSH_TTL_SECONDS = 4 * 60 * 60;
const PUSH_TIMEOUT_MS = 10_000;

/** Sends one encrypted push. Never throws: the sweep must keep going for other devices. */
export async function sendPush(target: PushTarget, payload: PushPayload, vapid: VapidConfig): Promise<SendResult> {
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: vapid,
        TTL: PUSH_TTL_SECONDS,
        urgency: "normal",
        topic: payload.tag,
        timeout: PUSH_TIMEOUT_MS,
      }
    );
    return "sent";
  } catch (err) {
    const status = (err as { statusCode?: number } | null)?.statusCode;
    return status === 404 || status === 410 ? "gone" : "failed";
  }
}
