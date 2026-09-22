import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

const schema = z.object({
  displayName: z.string().min(1).max(40).optional(),
  timezone: z
    .string()
    .min(1)
    .max(80)
    .refine((tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Invalid IANA timezone.")
    .optional(),
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

/** Updates the user's display name, timezone, and/or avatar color (any subset). */
export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid profile update." }, { status: 400 });

  const user = await prisma.user.update({ where: { id: userId }, data: parsed.data });
  return NextResponse.json({
    user: { displayName: user.displayName, timezone: user.timezone, avatarColor: user.avatarColor },
  });
}
