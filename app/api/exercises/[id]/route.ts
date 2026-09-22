import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  targetSets: z.number().int().min(1).max(20).optional(),
  targetReps: z.number().int().min(1).max(100).optional(),
  notes: z.string().max(300).nullable().optional(),
  order: z.number().int().min(0).optional(),
});

async function ownedExercise(id: string, userId: string) {
  const exercise = await prisma.exercise.findUnique({
    where: { id },
    include: { scheduleDay: true },
  });
  if (!exercise || exercise.scheduleDay.userId !== userId) return null;
  return exercise;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const existing = await ownedExercise(id, userId);
  if (!existing) return NextResponse.json({ error: "Exercise not found." }, { status: 404 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update." }, { status: 400 });

  const exercise = await prisma.exercise.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ exercise });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const existing = await ownedExercise(id, userId);
  if (!existing) return NextResponse.json({ error: "Exercise not found." }, { status: 404 });

  await prisma.exercise.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
