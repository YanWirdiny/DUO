import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { applyTodayCompletion, ensureScoresUpToDate, recomputeAfterLogChange } from "@/lib/scoring";
import { dateStrToUtcMidnight, todayInTz } from "@/lib/dates";
import { claimLateLog, getLateLogEligibility, LATE_LOG_MESSAGES, LateLogLimitError } from "@/lib/late-log";

const setSchema = z.object({
  exerciseId: z.string().min(1),
  setNumber: z.number().int().min(1),
  weight: z.number().min(0).max(2000),
  reps: z.number().int().min(0).max(200),
});

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scheduleDayId: z.string().min(1).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
  sets: z.array(setSchema).max(100),
});

/**
 * Upserts a completed workout log for a date and replaces its set logs.
 * New logs are allowed for today, or for a forgotten day inside the late-log
 * window (which may use one of the week's allowances); existing logs can always
 * be edited. Catches up lazy score evaluation first, then scores the log
 * immediately: today's via applyTodayCompletion, a late one by reversing the
 * already-applied missed-day penalties (the buddy's included) and re-scoring.
 */
export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid workout log." }, { status: 400 });
  }
  const { date, scheduleDayId, notes, sets } = parsed.data;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const dateValue = dateStrToUtcMidnight(date);
  const isToday = date === todayInTz(user.timezone);
  const existingLog = await prisma.workoutLog.findUnique({ where: { userId_date: { userId, date: dateValue } } });

  let isLate = false;
  let usesAllowance = false;
  if (!isToday && !existingLog) {
    const eligibility = await getLateLogEligibility(userId, user.timezone, date);
    if (!eligibility.allowed) {
      return NextResponse.json({ error: LATE_LOG_MESSAGES[eligibility.reason] }, { status: 403 });
    }
    isLate = true;
    usesAllowance = eligibility.usesAllowance;
  }

  if (scheduleDayId) {
    const scheduleDay = await prisma.scheduleDay.findUnique({ where: { id: scheduleDayId } });
    if (!scheduleDay || scheduleDay.userId !== userId) {
      return NextResponse.json({ error: "Schedule day not found." }, { status: 404 });
    }
  }

  const exerciseIds = [...new Set(sets.map((s) => s.exerciseId))];
  if (exerciseIds.length > 0) {
    const owned = await prisma.exercise.count({
      where: { id: { in: exerciseIds }, scheduleDay: { userId } },
    });
    if (owned !== exerciseIds.length) {
      return NextResponse.json({ error: "One or more exercises are invalid." }, { status: 400 });
    }
  }

  await ensureScoresUpToDate(userId);

  let workoutLog;
  try {
    workoutLog = await prisma.$transaction(async (tx) => {
      if (usesAllowance) await claimLateLog(tx, userId, user.timezone, date);
      const log = await tx.workoutLog.upsert({
        where: { userId_date: { userId, date: dateValue } },
        create: { userId, date: dateValue, scheduleDayId: scheduleDayId ?? undefined, notes: notes ?? undefined, completed: true },
        update: { scheduleDayId: scheduleDayId ?? undefined, notes: notes ?? undefined, completed: true },
    });
    await tx.setLog.deleteMany({ where: { workoutLogId: log.id } });
    if (sets.length > 0) {
      await tx.setLog.createMany({
        data: sets.map((s) => ({
          workoutLogId: log.id,
          exerciseId: s.exerciseId,
          setNumber: s.setNumber,
          weight: s.weight,
          reps: s.reps,
        })),
      });
    }
    return log;
    });
  } catch (err) {
    if (err instanceof LateLogLimitError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  if (isLate) await recomputeAfterLogChange(userId, date);
  else await applyTodayCompletion(userId, date);

  return NextResponse.json({ workoutLog });
}
