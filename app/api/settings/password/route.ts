import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId, hashPassword, verifyPassword } from "@/lib/auth";

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

/** Changes the user's password after verifying their current one. */
export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "New password must be at least 8 characters." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const valid = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  return NextResponse.json({ ok: true });
}
