import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

const schema = z.object({
  scheduleDayId: z.string().min(1),
  name: z.string().min(1).max(80),
  targetSets: z.number().int().min(1).max(20).default(3),
  targetReps: z.number().int().min(1).max(100).default(10),
  notes: z.string().max(300).optional().nullable(),
});

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid exercise." }, { status: 400 });
  }
  const { scheduleDayId, name, targetSets, targetReps, notes } = parsed.data;

  const scheduleDay = await prisma.scheduleDay.findUnique({ where: { id: scheduleDayId } });
  if (!scheduleDay || scheduleDay.userId !== userId) {
    return NextResponse.json({ error: "Schedule day not found." }, { status: 404 });
  }

  const count = await prisma.exercise.count({ where: { scheduleDayId } });
  const exercise = await prisma.exercise.create({
    data: { scheduleDayId, name, targetSets, targetReps, notes: notes ?? undefined, order: count },
  });

  return NextResponse.json({ exercise });
}
