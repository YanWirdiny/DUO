// Triggers the notification sweep: POST /api/cron/notifications with the shared
// secret. Run by the Railway cron service every 15 minutes (see DEPLOY.md):
//   APP_URL=https://… CRON_SECRET=… node scripts/notify-cron.mjs
import { pathToFileURL } from "node:url";

/** Calls the sweep endpoint and returns its JSON summary; throws on any failure. */
export async function triggerSweep({ appUrl, secret, fetchImpl = fetch }) {
  if (!appUrl || !secret) throw new Error("APP_URL and CRON_SECRET must be set.");
  const url = new URL("/api/cron/notifications", appUrl);
  if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    // The secret travels in a header: never send it in clear text over the internet.
    throw new Error("APP_URL must use https.");
  }
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(60_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Sweep failed with HTTP ${res.status}: ${body.error ?? "no details"}`);
  return body;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  triggerSweep({ appUrl: process.env.APP_URL, secret: process.env.CRON_SECRET })
    .then((summary) => console.log("[notify-cron]", JSON.stringify(summary)))
    .catch((err) => {
      console.error("[notify-cron]", err.message);
      process.exitCode = 1;
    });
}
