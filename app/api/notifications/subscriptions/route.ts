import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth";
import { removeSubscription, saveSubscription } from "@/lib/notifications";
import { NOTIFICATIONS } from "@/lib/notification-rules";
import { getVapidConfig, isAllowedPushEndpoint, isValidAuthSecret, isValidP256dh } from "@/lib/push";

const endpointSchema = z.string().min(1).max(1024).refine(isAllowedPushEndpoint);

// The shape of PushSubscription.toJSON() in the browser.
const subscribeSchema = z.strictObject({
  endpoint: endpointSchema,
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({
    p256dh: z.string().refine(isValidP256dh),
    auth: z.string().refine(isValidAuthSecret),
  }),
});

const unsubscribeSchema = z.strictObject({ endpoint: z.string().min(1).max(1024) });

/** Turns on notifications for this device: stores its push subscription. */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!getVapidConfig()) {
    return NextResponse.json({ error: "Notifications aren't set up on the server yet." }, { status: 503 });
  }

  const parsed = subscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });

  const { endpoint, keys } = parsed.data;
  const saved = await saveSubscription(userId, { endpoint, p256dh: keys.p256dh, auth: keys.auth });
  // Same answer as a malformed subscription: doesn't confirm the endpoint exists.
  if (!saved.ok && saved.reason === "endpoint_taken") {
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  }
  if (!saved.ok) {
    return NextResponse.json(
      { error: `Notifications are already on for ${NOTIFICATIONS.MAX_SUBSCRIPTIONS_PER_USER} devices. Turn one off first.` },
      { status: 409 }
    );
  }
  return NextResponse.json({ ok: true });
}

/** Turns off notifications for this device. Only the caller's own subscription can be removed. */
export async function DELETE(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = unsubscribeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  await removeSubscription(userId, parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
