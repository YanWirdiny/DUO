import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { createPairingCode, getBuddyId } from "@/lib/buddy";

/** Issues a fresh pairing code for the current user, rejecting if already paired. */
export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const existingBuddy = await getBuddyId(userId);
  if (existingBuddy) {
    return NextResponse.json({ error: "You're already connected with a buddy." }, { status: 400 });
  }

  const pairingCode = await createPairingCode(userId);
  return NextResponse.json({ code: pairingCode.code, expiresAt: pairingCode.expiresAt });
}
