import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

const schema = z.object({
  weekday: z.enum(WEEKDAYS),
  isGymDay: z.boolean(),
  label: z.string().max(60).optional().nullable(),
});

export async function PATCH(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid schedule update." }, { status: 400 });
  }
  const { weekday, isGymDay, label } = parsed.data;

  const day = await prisma.scheduleDay.upsert({
    where: { userId_weekday: { userId, weekday } },
    create: { userId, weekday, isGymDay, label },
    update: { isGymDay, label },
    include: { exercises: { orderBy: { order: "asc" } } },
  });

  return NextResponse.json({ day });
}
