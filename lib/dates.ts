import { formatInTimeZone } from "date-fns-tz";
import type { Weekday } from "@prisma/client";

/** Calendar date string in the canonical "YYYY-MM-DD" form. Weekday is intrinsic
 * to this string and does not depend on timezone — only "what day is it right now"
 * (todayInTz) needs the user's timezone. */
export type DateStr = string;

const WEEKDAYS: Weekday[] = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as Weekday[];

/** Today's date string in the given IANA timezone (the only tz-aware helper here). */
export function todayInTz(timezone: string): DateStr {
  return formatInTimeZone(new Date(), timezone, "yyyy-MM-dd");
}

/** Parses a "YYYY-MM-DD" string into a UTC-midnight `Date` for safe arithmetic. */
export function dateStrToUtcMidnight(dateStr: DateStr): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** Formats a `Date` back to its "YYYY-MM-DD" string, dropping the time component. */
export function utcMidnightToDateStr(date: Date): DateStr {
  return date.toISOString().slice(0, 10);
}

/** Returns the weekday (SUN..SAT) intrinsic to a date string. */
export function weekdayOf(dateStr: DateStr): Weekday {
  const d = dateStrToUtcMidnight(dateStr);
  return WEEKDAYS[d.getUTCDay()];
}

/** Shifts a date string by `amount` days (negative to go back). */
export function addDays(dateStr: DateStr, amount: number): DateStr {
  const d = dateStrToUtcMidnight(dateStr);
  d.setUTCDate(d.getUTCDate() + amount);
  return utcMidnightToDateStr(d);
}

/** Monday of the Mon–Sun week containing the date. */
export function startOfWeek(dateStr: DateStr): DateStr {
  const daysSinceMonday = (dateStrToUtcMidnight(dateStr).getUTCDay() + 6) % 7;
  return addDays(dateStr, -daysSinceMonday);
}

/** String comparison works because dates are in "YYYY-MM-DD" order. */
export function isBefore(a: DateStr, b: DateStr): boolean {
  return a < b;
}

/** String comparison works because dates are in "YYYY-MM-DD" order. */
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

/** Formats a date string as a friendly display label, e.g. "Mon, Jan 5". */
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
