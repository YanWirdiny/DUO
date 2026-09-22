import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  lockoutMessage,
  recordFailedLogin,
  resetFailedLogins,
  setSessionCookie,
  signSessionToken,
  verifyPassword,
} from "@/lib/auth";

const schema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// A bcrypt hash with no matching password, compared against on the "user not
// found" path so that path takes as long as a real failed-password check —
// otherwise the early-return would let timing distinguish valid usernames.
const DUMMY_HASH = "$2b$12$49LxcAktfLi6lwwFmX8tZewRGtVqqPXJT9YHhVqMY3dcWZU9aSUy.";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username: username.trim().toLowerCase() } });

  // Constant-shape response whether the user exists or not, to avoid username enumeration.
  const genericError = "Invalid username or password.";

  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    return NextResponse.json({ error: genericError }, { status: 401 });
  }

  const locked = lockoutMessage(user);
  if (locked) {
    return NextResponse.json({ error: locked }, { status: 429 });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordFailedLogin(user.id);
    return NextResponse.json({ error: genericError }, { status: 401 });
  }

  await resetFailedLogins(user.id);
  const token = await signSessionToken(user.id);
  await setSessionCookie(token);

  return NextResponse.json({ ok: true });
}
