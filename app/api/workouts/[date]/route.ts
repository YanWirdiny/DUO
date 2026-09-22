import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { dateStrToUtcMidnight } from "@/lib/dates";
import { recomputeAfterLogChange } from "@/lib/scoring";

export async function DELETE(_req: Request, { params }: { params: Promise<{ date: string }> }) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "Invalid date." }, { status: 400 });
  }

  await prisma.workoutLog.deleteMany({
    where: { userId, date: dateStrToUtcMidnight(date) },
  });

  await recomputeAfterLogChange(userId, date);

  return NextResponse.json({ ok: true });
}
