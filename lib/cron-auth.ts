import { createHash, timingSafeEqual } from "node:crypto";

/** Shorter secrets are treated as unset: the endpoint stays closed. */
export const MIN_CRON_SECRET_LENGTH = 32;

/** Whether CRON_SECRET is set and long enough for the cron endpoint to accept calls. */
export function isCronConfigured(secret: string | undefined = process.env.CRON_SECRET): secret is string {
  return !!secret && secret.length >= MIN_CRON_SECRET_LENGTH;
}

/**
 * Checks an `Authorization: Bearer <secret>` header against CRON_SECRET. Both
 * sides are hashed first so the constant-time compare always sees equal-length
 * input and the secret's length isn't leaked through timing.
 */
export function isAuthorizedCronRequest(
  authorization: string | null,
  secret: string | undefined = process.env.CRON_SECRET
): boolean {
  if (!isCronConfigured(secret)) return false;
  if (!authorization?.startsWith("Bearer ")) return false;
  const given = createHash("sha256").update(authorization.slice("Bearer ".length)).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}
