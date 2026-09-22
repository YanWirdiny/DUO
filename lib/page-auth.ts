import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { ensureScoresUpToDate } from "@/lib/scoring";

/** Server-component guard: redirects to /login if unauthenticated (defense in
 * depth alongside middleware), and catches up streak/score before the page reads them. */
export async function requireUser() {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  await ensureScoresUpToDate(userId);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/login");
  return user;
}
