import { SignJWT, jwtVerify } from "jose";

// Edge-safe: no Prisma, no bcrypt. Used by both middleware (edge runtime) and
// lib/auth.ts (node runtime) so the two never disagree on how a session is signed.

export const SESSION_COOKIE_NAME = "duo_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Loads and encodes the JWT signing secret; throws if `JWT_SECRET` is missing. */
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(secret);
}

/** Signs a session JWT with the user id as subject, expiring after `SESSION_TTL_SECONDS`. */
export async function signSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

/** Verifies a session JWT and returns the user id, or `null` if invalid/expired. */
export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
