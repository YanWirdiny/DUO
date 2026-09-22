import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { disconnectBuddy } from "@/lib/buddy";

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  await disconnectBuddy(userId);
  return NextResponse.json({ ok: true });
}
