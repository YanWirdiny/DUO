import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import {
  SESSION_COOKIE_NAME,
  SESSION_TTL_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "@/lib/session";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

export { signSessionToken, verifySessionToken, SESSION_COOKIE_NAME };

/** Hashes a plaintext password with bcrypt (cost factor 12). */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/** Checks a plaintext password against a bcrypt hash. */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Sets the signed session JWT as an httpOnly cookie. */
export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

/** Removes the session cookie (logout). */
export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE_NAME);
}

/** Reads and verifies the session cookie, returning the user id or null. */
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Loads the full user record for the current session, or null if unauthenticated. */
export async function getCurrentUser() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  return prisma.user.findUnique({ where: { id: userId } });
}

/** Returns a user-facing message if the account is currently locked out, else null. */
export function lockoutMessage(user: { lockedUntil: Date | null }): string | null {
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`;
  }
  return null;
}

/** Increments the failed-login counter and locks the account once `MAX_FAILED_ATTEMPTS` is hit. */
export async function recordFailedLogin(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const failedLoginCount = user.failedLoginCount + 1;
  const lockedUntil =
    failedLoginCount >= MAX_FAILED_ATTEMPTS
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
      : user.lockedUntil;
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount, lockedUntil },
  });
}

/** Clears the failed-login counter and any active lockout after a successful login. */
export async function resetFailedLogins(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: 0, lockedUntil: null },
  });
}
