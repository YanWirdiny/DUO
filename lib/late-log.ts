import { prisma } from "@/lib/db";
import { addDays, dateStrToUtcMidnight, startOfWeek, todayInTz, weekdayOf, type DateStr } from "@/lib/dates";

export const LATE_LOG = {
  /** How many days back a forgotten workout can still be logged (1 = yesterday only,
   * i.e. a 24-hour window after the day ends in the user's timezone). */
  WINDOW_DAYS: 1,
  /** Late logs allowed per Mon–Sun week, counted against the week they're used in. */
  MAX_PER_WEEK: 2,
};

export type LateLogIneligibleReason = "outside_window" | "already_logged" | "limit_reached";

export type LateLogEligibility =
  | { allowed: true; usesAllowance: boolean; remaining: number }
  | { allowed: false; reason: LateLogIneligibleReason; remaining: number };

export const LATE_LOG_MESSAGES: Record<LateLogIneligibleReason, string> = {
  outside_window: "You can only log a forgotten workout for yesterday.",
  already_logged: "This day is already logged.",
  limit_reached: `You've used both late logs this week (max ${LATE_LOG.MAX_PER_WEEK}).`,
};

/** Monday of the current week in the user's timezone, as stored in LateLog.weekStart. */
function currentWeekStart(timezone: string): Date {
  return dateStrToUtcMidnight(startOfWeek(todayInTz(timezone)));
}

/** Late logs still available to the user this week. */
export async function lateLogsRemaining(userId: string, timezone: string): Promise<number> {
  const used = await prisma.lateLog.count({ where: { userId, weekStart: currentWeekStart(timezone) } });
  return Math.max(0, LATE_LOG.MAX_PER_WEEK - used);
}

/**
 * Whether the user can create a new workout log for a past `date` right now.
 * Only days inside the late window qualify. A scheduled gym day uses one of the
 * week's allowances; a rest day, or a day whose allowance was already used (log
 * deleted and re-logged), is free. Shared by the API, log page, and dashboard so
 * they always agree.
 */
export async function getLateLogEligibility(
  userId: string,
  timezone: string,
  date: DateStr
): Promise<LateLogEligibility> {
  const today = todayInTz(timezone);
  const dateValue = dateStrToUtcMidnight(date);

  const [remaining, existingLog, existingClaim, scheduleDay] = await Promise.all([
    lateLogsRemaining(userId, timezone),
    prisma.workoutLog.findUnique({ where: { userId_date: { userId, date: dateValue } } }),
    prisma.lateLog.findUnique({ where: { userId_targetDate: { userId, targetDate: dateValue } } }),
    prisma.scheduleDay.findUnique({ where: { userId_weekday: { userId, weekday: weekdayOf(date) } } }),
  ]);

  const oldestAllowed = addDays(today, -LATE_LOG.WINDOW_DAYS);
  if (date >= today || date < oldestAllowed) return { allowed: false, reason: "outside_window", remaining };
  if (existingLog) return { allowed: false, reason: "already_logged", remaining };

  const usesAllowance = !!scheduleDay?.isGymDay && !existingClaim;
  if (usesAllowance && remaining === 0) return { allowed: false, reason: "limit_reached", remaining };
  return { allowed: true, usesAllowance, remaining };
}

/** Records one use of the weekly allowance for `date`. Must run inside the same
 * transaction that creates the workout log; throws if the week's limit was hit
 * concurrently so the whole log is rolled back. */
export async function claimLateLog(
  tx: Pick<typeof prisma, "lateLog">,
  userId: string,
  timezone: string,
  date: DateStr
): Promise<void> {
  const weekStart = currentWeekStart(timezone);
  const used = await tx.lateLog.count({ where: { userId, weekStart } });
  if (used >= LATE_LOG.MAX_PER_WEEK) throw new LateLogLimitError();
  await tx.lateLog.create({ data: { userId, targetDate: dateStrToUtcMidnight(date), weekStart } });
}

export class LateLogLimitError extends Error {
  constructor() {
    super(LATE_LOG_MESSAGES.limit_reached);
  }
}
