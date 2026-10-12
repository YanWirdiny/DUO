import { prisma } from "@/lib/db";
import { addDays, dateStrToUtcMidnight, isAfter, utcMidnightToDateStr, weekdayOf, type DateStr } from "@/lib/dates";
import type { Weekday } from "@prisma/client";

export const HOME = {
  /** How many of the most recent sessions the effort chart shows. */
  EFFORT_BARS: 7,
};

/** "workout": worked out (past) or a planned gym day (future). "rest": anything else. */
export type WeekDayKind = "workout" | "rest" | "today";
export type WeekDay = { date: DateStr; kind: WeekDayKind };

/**
 * The Mon–Sun week containing `today`, one entry per day. Past days reflect what
 * happened (a completed log makes it a workout day, even off-schedule); future
 * days reflect the plan. Today is always its own kind.
 */
export function buildWeekStrip(today: DateStr, weekStart: DateStr, gymWeekdays: Set<Weekday>, loggedDates: Set<DateStr>): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    if (date === today) return { date, kind: "today" };
    const worked = isAfter(date, today) ? gymWeekdays.has(weekdayOf(date)) : loggedDates.has(date);
    return { date, kind: worked ? "workout" : "rest" };
  });
}

export type SessionVolume = { date: DateStr; volume: number };

export type EffortSummary = {
  /** The last `HOME.EFFORT_BARS` sessions, oldest first. */
  bars: SessionVolume[];
  /** Lifetime volume (weight × reps over every set ever logged). */
  total: number;
  /** Share of the lifetime total added this week, in whole percent. Null when there's nothing to compare against. */
  growthPct: number | null;
};

/** Reduces every completed session's volume (oldest first) into what the effort card shows. */
export function summarizeEffort(sessions: SessionVolume[], weekStart: DateStr): EffortSummary {
  let total = 0;
  let thisWeek = 0;
  for (const s of sessions) {
    total += s.volume;
    if (!isAfter(weekStart, s.date)) thisWeek += s.volume;
  }
  const before = total - thisWeek;
  return {
    bars: sessions.slice(-HOME.EFFORT_BARS),
    total,
    growthPct: before > 0 ? Math.round((thisWeek / before) * 100) : null,
  };
}

/** Compact volume label: 950, 12.4k, 1.2M. */
export function formatVolume(volume: number): string {
  const compact = (n: number, suffix: string) => `${n.toFixed(1).replace(/\.0$/, "")}${suffix}`;
  if (volume >= 1_000_000) return compact(volume / 1_000_000, "M");
  if (volume >= 1_000) return compact(volume / 1_000, "k");
  return String(Math.round(volume));
}

/** Volume of every completed session, oldest first. Summed in SQL so history size doesn't matter. */
export async function loadSessionVolumes(userId: string): Promise<SessionVolume[]> {
  const rows = await prisma.$queryRaw<{ date: Date; volume: number }[]>`
    SELECT wl."date", COALESCE(SUM(s."weight" * s."reps"), 0)::float8 AS volume
    FROM "WorkoutLog" wl
    LEFT JOIN "SetLog" s ON s."workoutLogId" = wl."id"
    WHERE wl."userId" = ${userId} AND wl."completed" = true
    GROUP BY wl."id", wl."date"
    ORDER BY wl."date" ASC`;
  return rows.map((r) => ({ date: utcMidnightToDateStr(r.date), volume: r.volume }));
}

/** Net score points earned since `weekStart` (bonuses minus penalties). */
export async function weeklyScoreChange(userId: string, weekStart: DateStr): Promise<number> {
  const { _sum } = await prisma.scoreEvent.aggregate({
    _sum: { points: true },
    where: { userId, date: { gte: dateStrToUtcMidnight(weekStart) } },
  });
  return _sum.points ?? 0;
}
