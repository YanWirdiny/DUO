import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

/** Clears the session cookie, ending the current login. */
export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
