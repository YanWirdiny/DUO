import { prisma } from "@/lib/db";
import { getBuddyId } from "@/lib/buddy";
import {
  addDays,
  dateStrToUtcMidnight,
  enumerateRange,
  isAfter,
  todayInTz,
  utcMidnightToDateStr,
  weekdayOf,
  type DateStr,
} from "@/lib/dates";
import type { Weekday } from "@prisma/client";

export const SCORING = {
  BASE_COMPLETION_POINTS: 10,
  MISSED_PENALTY_POINTS: 15,
  BUDDY_PENALTY_POINTS: 10,
  MILESTONE_BONUS: 25,
  MILESTONES: [3, 7, 14, 21, 30, 60, 100, 180, 365] as number[],
};

/** Extra points for hitting a milestone streak length, or 0 if not a milestone day. */
function milestoneBonusFor(streak: number): number {
  return SCORING.MILESTONES.includes(streak) ? SCORING.MILESTONE_BONUS : 0;
}

/** Base completion points plus any milestone bonus for the streak reached today. */
function pointsForCompletion(newStreak: number): { points: number; milestone: boolean } {
  const bonus = milestoneBonusFor(newStreak);
  return { points: SCORING.BASE_COMPLETION_POINTS + bonus, milestone: bonus > 0 };
}

/** Advances a single user's score/streak watermark from the day after their
 * lastEvaluatedDate through yesterday, applying completion bonuses and missed-day
 * penalties (including the cross-penalty to their buddy). Safe to call often —
 * it's a no-op once a user is already caught up through yesterday. */
export async function ensureScoresUpToDate(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const today = todayInTz(user.timezone);
  const yesterday = addDays(today, -1);
  const start = user.lastEvaluatedDate
    ? addDays(utcMidnightToDateStr(user.lastEvaluatedDate), 1)
    : addDays(utcMidnightToDateStr(user.createdAt), 0);

  if (isAfter(start, yesterday)) return; // already caught up

  const scheduleDays = await prisma.scheduleDay.findMany({ where: { userId, isGymDay: true } });
  const gymWeekdays = new Set<Weekday>(scheduleDays.map((d) => d.weekday));
  if (gymWeekdays.size === 0) {
    // No schedule set yet — nothing to evaluate, just advance the watermark.
    await prisma.user.update({
      where: { id: userId },
      data: { lastEvaluatedDate: dateStrToUtcMidnight(yesterday) },
    });
    return;
  }

  const buddyId = await getBuddyId(userId);
  const datesToCheck = enumerateRange(start, yesterday).filter((d) => gymWeekdays.has(weekdayOf(d)));

  if (datesToCheck.length > 0) {
    const logs = await prisma.workoutLog.findMany({
      where: { userId, date: { in: datesToCheck.map(dateStrToUtcMidnight) }, completed: true },
    });
    const loggedDates = new Set(logs.map((l) => utcMidnightToDateStr(l.date)));

    let streak = user.currentStreak;
    let longest = user.longestStreak;
    let scoreDelta = 0;
    const events: { userId: string; date: Date; type: "STREAK_BONUS" | "MILESTONE_BONUS" | "MISSED_PENALTY" | "BUDDY_PENALTY"; points: number; reason: string }[] = [];
    let buddyPenaltyTotal = 0;

    for (const date of datesToCheck) {
      if (loggedDates.has(date)) {
        streak += 1;
        longest = Math.max(longest, streak);
        const { points, milestone } = pointsForCompletion(streak);
        scoreDelta += points;
        events.push({
          userId,
          date: dateStrToUtcMidnight(date),
          type: milestone ? "MILESTONE_BONUS" : "STREAK_BONUS",
          points,
          reason: milestone
            ? `${streak}-day streak milestone`
            : `Logged scheduled workout (streak: ${streak})`,
        });
      } else {
        streak = 0;
        scoreDelta -= SCORING.MISSED_PENALTY_POINTS;
        events.push({
          userId,
          date: dateStrToUtcMidnight(date),
          type: "MISSED_PENALTY",
          points: -SCORING.MISSED_PENALTY_POINTS,
          reason: "Missed a scheduled workout day",
        });
        if (buddyId) {
          buddyPenaltyTotal += SCORING.BUDDY_PENALTY_POINTS;
          events.push({
            userId: buddyId,
            date: dateStrToUtcMidnight(date),
            type: "BUDDY_PENALTY",
            points: -SCORING.BUDDY_PENALTY_POINTS,
            reason: "Buddy missed their scheduled workout day",
          });
        }
      }
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          currentStreak: streak,
          longestStreak: longest,
          gymScore: { increment: scoreDelta },
          lastEvaluatedDate: dateStrToUtcMidnight(yesterday),
        },
      }),
      ...(buddyId && buddyPenaltyTotal > 0
        ? [
            prisma.user.update({
              where: { id: buddyId },
              data: { gymScore: { decrement: buddyPenaltyTotal } },
            }),
          ]
        : []),
      ...(events.length > 0 ? [prisma.scoreEvent.createMany({ data: events })] : []),
    ]);
  } else {
    await prisma.user.update({
      where: { id: userId },
      data: { lastEvaluatedDate: dateStrToUtcMidnight(yesterday) },
    });
  }
}

/** Streak/longest-streak as of the end of `throughDate`, replaying every scheduled
 * gym day from `fromDate` forward against actual logged completions. Used to
 * re-derive a user's streak state after a past day's log is deleted, since the
 * reset-to-zero-on-miss rule makes streak non-additive (can't just subtract one
 * event's contribution the way gymScore can). */
async function computeStreakThrough(
  userId: string,
  gymWeekdays: Set<Weekday>,
  fromDate: DateStr,
  throughDate: DateStr
): Promise<{ streak: number; longest: number }> {
  if (gymWeekdays.size === 0 || isAfter(fromDate, throughDate)) return { streak: 0, longest: 0 };

  const dates = enumerateRange(fromDate, throughDate).filter((d) => gymWeekdays.has(weekdayOf(d)));
  if (dates.length === 0) return { streak: 0, longest: 0 };

  const logs = await prisma.workoutLog.findMany({
    where: { userId, date: { in: dates.map(dateStrToUtcMidnight) }, completed: true },
  });
  const loggedDates = new Set(logs.map((l) => utcMidnightToDateStr(l.date)));

  let streak = 0;
  let longest = 0;
  for (const date of dates) {
    if (loggedDates.has(date)) {
      streak += 1;
      longest = Math.max(longest, streak);
    } else {
      streak = 0;
    }
  }
  return { streak, longest };
}

/** Call after a workout log for an already-evaluated day (today or earlier) is
 * deleted, or a past day's log is removed some other way. Reverses the
 * gymScore/streak/buddy-penalty effects that day previously contributed, rewinds
 * the watermark to just before it, and re-runs evaluation so the now-empty day
 * (and anything after it) gets scored fresh against current log data. Safe to
 * call for a day that was never evaluated — it's a no-op. */
export async function recomputeAfterLogChange(userId: string, affectedDateStr: DateStr): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.lastEvaluatedDate) return;

  const watermark = utcMidnightToDateStr(user.lastEvaluatedDate);
  if (isAfter(affectedDateStr, watermark)) return; // never evaluated — nothing to reverse

  const dayBefore = addDays(affectedDateStr, -1);
  const affectedDateValue = dateStrToUtcMidnight(affectedDateStr);
  const buddyId = await getBuddyId(userId);

  // Only events caused by userId's own attendance on/after this date get reversed.
  // A BUDDY_PENALTY recorded under userId was caused by the *buddy's* miss, not by
  // userId's own log — it must survive untouched even though it lives in userId's
  // own ScoreEvent rows.
  const [selfEvents, buddyEvents] = await Promise.all([
    prisma.scoreEvent.findMany({
      where: {
        userId,
        date: { gte: affectedDateValue },
        type: { in: ["STREAK_BONUS", "MILESTONE_BONUS", "MISSED_PENALTY"] },
      },
    }),
    buddyId
      ? prisma.scoreEvent.findMany({
          where: { userId: buddyId, date: { gte: affectedDateValue }, type: "BUDDY_PENALTY" },
        })
      : Promise.resolve([]),
  ]);
  const selfDelta = selfEvents.reduce((sum, e) => sum + e.points, 0);
  const buddyDelta = buddyEvents.reduce((sum, e) => sum + e.points, 0);

  const scheduleDays = await prisma.scheduleDay.findMany({ where: { userId, isGymDay: true } });
  const gymWeekdays = new Set<Weekday>(scheduleDays.map((d) => d.weekday));
  const { streak, longest } = await computeStreakThrough(
    userId,
    gymWeekdays,
    utcMidnightToDateStr(user.createdAt),
    dayBefore
  );

  await prisma.$transaction([
    prisma.scoreEvent.deleteMany({
      where: {
        userId,
        date: { gte: affectedDateValue },
        type: { in: ["STREAK_BONUS", "MILESTONE_BONUS", "MISSED_PENALTY"] },
      },
    }),
    ...(buddyId
      ? [
          prisma.scoreEvent.deleteMany({
            where: { userId: buddyId, date: { gte: affectedDateValue }, type: "BUDDY_PENALTY" },
          }),
        ]
      : []),
    prisma.user.update({
      where: { id: userId },
      data: {
        currentStreak: streak,
        longestStreak: longest,
        gymScore: { decrement: selfDelta },
        lastEvaluatedDate: dateStrToUtcMidnight(dayBefore),
      },
    }),
    ...(buddyId && buddyDelta !== 0
      ? [prisma.user.update({ where: { id: buddyId }, data: { gymScore: { decrement: buddyDelta } } })]
      : []),
  ]);

  // Re-evaluate the freed-up range (through yesterday) against current log data —
  // e.g. a deleted past-day log is immediately re-flagged as missed, with the
  // correct buddy cross-penalty, rather than staying silently un-evaluated.
  await ensureScoresUpToDate(userId);
}

/** Call right after a user logs today's workout so streak/score reflect it
 * immediately instead of waiting for the next lazy evaluation pass. */
export async function applyTodayCompletion(userId: string, dateStr: DateStr): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;
  const today = todayInTz(user.timezone);
  if (dateStr !== today) return; // only today's log affects streak/score immediately

  const scheduleDay = await prisma.scheduleDay.findUnique({
    where: { userId_weekday: { userId, weekday: weekdayOf(dateStr) } },
  });
  if (!scheduleDay?.isGymDay) return; // logging on a non-gym day is just a bonus record

  const alreadyWatermarked = user.lastEvaluatedDate
    ? !isAfter(dateStr, utcMidnightToDateStr(user.lastEvaluatedDate))
    : false;
  if (alreadyWatermarked) return; // already scored by the lazy evaluator

  const streak = user.currentStreak + 1;
  const longest = Math.max(user.longestStreak, streak);
  const { points, milestone } = pointsForCompletion(streak);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: {
        currentStreak: streak,
        longestStreak: longest,
        gymScore: { increment: points },
        lastEvaluatedDate: dateStrToUtcMidnight(dateStr),
      },
    }),
    prisma.scoreEvent.create({
      data: {
        userId,
        date: dateStrToUtcMidnight(dateStr),
        type: milestone ? "MILESTONE_BONUS" : "STREAK_BONUS",
        points,
        reason: milestone ? `${streak}-day streak milestone` : `Logged scheduled workout (streak: ${streak})`,
      },
    }),
  ]);
}
