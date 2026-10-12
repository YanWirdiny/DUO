// Pure notification rules: no Prisma, no web-push, so client components can import
// the constants and time helpers without pulling the database into their bundle.
import type { NotificationType } from "@prisma/client";
import type { DateStr } from "@/lib/dates";

export const NOTIFICATIONS = {
  /** Default time for the morning "it's a gym day" reminder (08:00 local). */
  DEFAULT_GYM_DAY_MINUTE: 8 * 60,
  /** Default time for the evening "you haven't logged yet" reminder (20:00 local). */
  DEFAULT_LOG_REMINDER_MINUTE: 20 * 60,
  /** A reminder is still sent this long after its time, so a late or skipped cron
   * run doesn't lose it. Past the window it's dropped rather than sent hours late. */
  SEND_WINDOW_MINUTES: 180,
  /** Devices one user can register; stops a script from filling the table. */
  MAX_SUBSCRIPTIONS_PER_USER: 5,
  /** Delivery records older than this are pruned by the sweep. */
  DELIVERY_RETENTION_DAYS: 14,
  /** Missed and buddy penalties quoted in the log reminder. Mirrors SCORING in
   * lib/scoring.ts (kept here so this module stays Prisma-free; a test pins them). */
  MISSED_PENALTY_POINTS: 15,
  BUDDY_PENALTY_POINTS: 10,
} as const;

export type NotificationPreferences = {
  gymDayEnabled: boolean;
  gymDayMinute: number;
  logReminderEnabled: boolean;
  logReminderMinute: number;
};

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  gymDayEnabled: true,
  gymDayMinute: NOTIFICATIONS.DEFAULT_GYM_DAY_MINUTE,
  logReminderEnabled: true,
  logReminderMinute: NOTIFICATIONS.DEFAULT_LOG_REMINDER_MINUTE,
};

/** What the service worker receives. Only non-sensitive text and a same-origin path. */
export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: NotificationType;
};

/** "HH:MM" (24h, zero-padded) — the only time format the API accepts. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 0–1439 → "HH:MM". */
export function minuteToTime(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "HH:MM" → 0–1439. Callers validate with TIME_PATTERN first. */
export function timeToMinute(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Preferences as the API and settings form speak them: times as "HH:MM". */
export type NotificationPreferencesDto = {
  gymDayEnabled: boolean;
  gymDayTime: string;
  logReminderEnabled: boolean;
  logReminderTime: string;
};

export function preferencesToDto(prefs: NotificationPreferences): NotificationPreferencesDto {
  return {
    gymDayEnabled: prefs.gymDayEnabled,
    gymDayTime: minuteToTime(prefs.gymDayMinute),
    logReminderEnabled: prefs.logReminderEnabled,
    logReminderTime: minuteToTime(prefs.logReminderMinute),
  };
}

/** Whether `minute` falls in [target, target + SEND_WINDOW_MINUTES). The window
 * never wraps past midnight: a reminder belongs to the day it was set for. */
export function isInSendWindow(minute: number, target: number): boolean {
  return minute >= target && minute < target + NOTIFICATIONS.SEND_WINDOW_MINUTES;
}

/**
 * Which reminders are due right now for one user. Both only fire on a scheduled
 * gym day that hasn't been logged yet: once the workout is logged there's
 * nothing to remind about. Delivery de-duplication is the caller's job.
 */
export function dueReminders(ctx: {
  prefs: NotificationPreferences;
  minute: number;
  isGymDay: boolean;
  loggedToday: boolean;
}): NotificationType[] {
  const { prefs, minute, isGymDay, loggedToday } = ctx;
  if (!isGymDay || loggedToday) return [];

  const due: NotificationType[] = [];
  if (prefs.gymDayEnabled && isInSendWindow(minute, prefs.gymDayMinute)) due.push("GYM_DAY");
  if (prefs.logReminderEnabled && isInSendWindow(minute, prefs.logReminderMinute)) due.push("LOG_REMINDER");
  return due;
}

/** The notification text for a due reminder. */
export function buildReminder(
  type: NotificationType,
  ctx: { date: DateStr; label: string | null; exerciseCount: number; buddyName: string | null }
): PushPayload {
  if (type === "GYM_DAY") {
    const plan = ctx.label ? `${ctx.label} is on the plan today` : "Today is a gym day";
    const exercises =
      ctx.exerciseCount > 0 ? ` — ${ctx.exerciseCount} exercise${ctx.exerciseCount === 1 ? "" : "s"} lined up` : "";
    return { title: "Gym day", body: `${plan}${exercises}. Keep the streak alive.`, url: "/", tag: type };
  }

  const buddy = ctx.buddyName ? `, and ${ctx.buddyName} loses ${NOTIFICATIONS.BUDDY_PENALTY_POINTS}` : "";
  return {
    title: "Don't forget to log",
    body: `Log today's workout before midnight. Missing it costs you ${NOTIFICATIONS.MISSED_PENALTY_POINTS} points${buddy}.`,
    url: `/log/${ctx.date}`,
    tag: type,
  };
}
