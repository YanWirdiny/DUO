import { NextResponse } from "next/server";
import { isAuthorizedCronRequest, isCronConfigured } from "@/lib/cron-auth";
import { sendDueNotifications } from "@/lib/notifications";
import { getVapidConfig, sendPush } from "@/lib/push";

/**
 * Sends whatever reminders are due. Called every 15 minutes by the scheduler
 * (scripts/notify-cron.mjs) with `Authorization: Bearer $CRON_SECRET`. Public
 * in proxy.ts because there's no session; the secret is the only gate, so a
 * missing or short CRON_SECRET keeps it closed (401, same as a wrong secret).
 * Safe to call repeatedly: each reminder is sent at most once per user per day.
 */
export async function POST(req: Request) {
  if (!isCronConfigured()) console.warn("[cron] CRON_SECRET is missing or shorter than 32 characters");
  if (!isAuthorizedCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vapid = getVapidConfig();
  if (!vapid) return NextResponse.json({ error: "VAPID keys are not configured." }, { status: 503 });

  const result = await sendDueNotifications((target, payload) => sendPush(target, payload, vapid));
  return NextResponse.json(result);
}
