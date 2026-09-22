import { formatInTimeZone } from "date-fns-tz";
import type { Weekday } from "@prisma/client";

/** Calendar date string in the canonical "YYYY-MM-DD" form. Weekday is intrinsic
 * to this string and does not depend on timezone — only "what day is it right now"
 * (todayInTz) needs the user's timezone. */
export type DateStr = string;

const WEEKDAYS: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as Weekday[];

export function todayInTz(timezone: string): DateStr {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
}

export function dateStrToUtcMidnight(dateStr: DateStr): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function utcMidnightToDateStr(date: Date): DateStr {
  return date.toISOString().slice(0, 10);
}

export function weekdayOf(dateStr: DateStr): Weekday {
  const d = dateStrToUtcMidnight(dateStr);
  return WEEKDAYS[d.getUTCDay()];
}

export function addDays(dateStr: DateStr, amount: number): DateStr {
  const d = dateStrToUtcMidnight(dateStr);
  d.setUTCDate(d.getUTCDate() + amount);
  return utcMidnightToDateStr(d);
}

export function isBefore(a: DateStr, b: DateStr): boolean {
  return a < b;
}

export function isAfter(a: DateStr, b: DateStr): boolean {
  return a > b;
}

/** Inclusive list of date strings from start to end. Empty if start > end. */
export function enumerateRange(start: DateStr, end: DateStr): DateStr[] {
  const out: DateStr[] = [];
  let cur = start;
  while (!isAfter(cur, end)) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

export function formatFriendly(dateStr: DateStr): string {
  const d = dateStrToUtcMidnight(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
} as Record<Weekday, string>;

export const WEEKDAY_ORDER: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as Weekday[];
