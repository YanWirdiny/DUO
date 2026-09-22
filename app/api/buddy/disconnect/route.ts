import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { disconnectBuddy } from "@/lib/buddy";

/** Ends the current user's buddy pairing, if any. */
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await disconnectBuddy(userId);
  return NextResponse.json({ ok: true });
}
