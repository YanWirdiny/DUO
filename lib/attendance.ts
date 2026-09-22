import { prisma } from "@/lib/db";
import {
  addDays,
  dateStrToUtcMidnight,
  enumerateRange,
  todayInTz,
  utcMidnightToDateStr,
  weekdayOf,
  type DateStr,
} from "@/lib/dates";

export type DayStatus = "completed" | "missed" | "rest" | "future";
export type AttendanceDay = { date: DateStr; status: DayStatus };

export async function buildAttendance(userId: string, timezone: string, days: number): Promise<AttendanceDay[]> {
  const today = todayInTz(timezone);
  const start = addDays(today, -(days - 1));

  const scheduleDays = await prisma.scheduleDay.findMany({ where: { userId, isGymDay: true } });
  const gymWeekdays = new Set(scheduleDays.map((d) => d.weekday));

  const logs = await prisma.workoutLog.findMany({
    where: { userId, date: { gte: dateStrToUtcMidnight(start) }, completed: true },
  });
  const loggedDates = new Set(logs.map((l) => utcMidnightToDateStr(l.date)));

  return enumerateRange(start, today).map((date) => {
    if (!gymWeekdays.has(weekdayOf(date))) return { date, status: "rest" };
    return { date, status: loggedDates.has(date) ? "completed" : "missed" };
  });
}
