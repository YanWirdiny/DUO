import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReminder,
  DEFAULT_PREFERENCES,
  dueReminders,
  isInSendWindow,
  minuteToTime,
  NOTIFICATIONS,
  preferencesToDto,
  TIME_PATTERN,
  timeToMinute,
} from "@/lib/notification-rules";
import { SCORING } from "@/lib/scoring";
import { nowInTz } from "@/lib/dates";

describe("time helpers", () => {
  test("minuteToTime and timeToMinute round-trip every minute of the day", () => {
    for (let m = 0; m < 24 * 60; m++) assert.equal(timeToMinute(minuteToTime(m)), m);
    assert.equal(minuteToTime(0), "00:00");
    assert.equal(minuteToTime(8 * 60 + 5), "08:05");
    assert.equal(minuteToTime(23 * 60 + 59), "23:59");
  });

  test("TIME_PATTERN only accepts zero-padded 24h HH:MM", () => {
    for (const ok of ["00:00", "08:30", "19:05", "23:59"]) assert.ok(TIME_PATTERN.test(ok), ok);
    for (const bad of ["24:00", "8:30", "08:60", "08:3", "0830", "08:30:00", " 08:30", "ab:cd", ""]) {
      assert.ok(!TIME_PATTERN.test(bad), bad);
    }
  });

  test("preferencesToDto formats minutes as HH:MM", () => {
    assert.deepEqual(preferencesToDto(DEFAULT_PREFERENCES), {
      gymDayEnabled: true,
      gymDayTime: "08:00",
      logReminderEnabled: true,
      logReminderTime: "20:00",
    });
  });

  test("nowInTz gives the local day and minute", () => {
    const instant = new Date("2026-10-08T03:30:00Z");
    assert.deepEqual(nowInTz("UTC", instant), { date: "2026-10-08", minute: 3 * 60 + 30 });
    // 03:30 UTC is still the previous evening in New York (UTC-4 in October).
    assert.deepEqual(nowInTz("America/New_York", instant), { date: "2026-10-07", minute: 23 * 60 + 30 });
    assert.equal(typeof nowInTz("UTC").minute, "number");
  });
});

describe("isInSendWindow", () => {
  test("opens at the target minute and closes SEND_WINDOW_MINUTES later", () => {
    const target = 8 * 60;
    assert.equal(isInSendWindow(target - 1, target), false);
    assert.equal(isInSendWindow(target, target), true);
    assert.equal(isInSendWindow(target + NOTIFICATIONS.SEND_WINDOW_MINUTES - 1, target), true);
    assert.equal(isInSendWindow(target + NOTIFICATIONS.SEND_WINDOW_MINUTES, target), false);
  });

  test("never wraps past midnight", () => {
    assert.equal(isInSendWindow(5, 23 * 60 + 30), false);
  });
});

describe("dueReminders", () => {
  const base = { prefs: DEFAULT_PREFERENCES, isGymDay: true, loggedToday: false };

  test("gym-day reminder at its time, log reminder at its time", () => {
    assert.deepEqual(dueReminders({ ...base, minute: 8 * 60 }), ["GYM_DAY"]);
    assert.deepEqual(dueReminders({ ...base, minute: 20 * 60 + 15 }), ["LOG_REMINDER"]);
    assert.deepEqual(dueReminders({ ...base, minute: 12 * 60 }), []);
  });

  test("nothing on rest days or once the day is logged", () => {
    assert.deepEqual(dueReminders({ ...base, minute: 8 * 60, isGymDay: false }), []);
    assert.deepEqual(dueReminders({ ...base, minute: 20 * 60, loggedToday: true }), []);
  });

  test("disabled reminders never fire", () => {
    const prefs = { ...DEFAULT_PREFERENCES, gymDayEnabled: false, logReminderEnabled: false };
    assert.deepEqual(dueReminders({ ...base, prefs, minute: 8 * 60 }), []);
    assert.deepEqual(dueReminders({ ...base, prefs, minute: 20 * 60 }), []);
  });

  test("both fire when their windows overlap", () => {
    const prefs = { ...DEFAULT_PREFERENCES, gymDayMinute: 18 * 60, logReminderMinute: 19 * 60 };
    assert.deepEqual(dueReminders({ ...base, prefs, minute: 19 * 60 + 10 }), ["GYM_DAY", "LOG_REMINDER"]);
  });
});

describe("buildReminder", () => {
  const ctx = { date: "2026-10-08", label: null, exerciseCount: 0, buddyName: null };

  test("gym day with a label and exercises", () => {
    const p = buildReminder("GYM_DAY", { ...ctx, label: "Push Day", exerciseCount: 4 });
    assert.deepEqual(p, {
      title: "Gym day",
      body: "Push Day is on the plan today — 4 exercises lined up. Keep the streak alive.",
      url: "/",
      tag: "GYM_DAY",
    });
  });

  test("gym day without a label, singular exercise, and with none", () => {
    assert.equal(
      buildReminder("GYM_DAY", { ...ctx, exerciseCount: 1 }).body,
      "Today is a gym day — 1 exercise lined up. Keep the streak alive."
    );
    assert.equal(buildReminder("GYM_DAY", ctx).body, "Today is a gym day. Keep the streak alive.");
  });

  test("log reminder links to the day's log page and names the buddy's penalty", () => {
    const p = buildReminder("LOG_REMINDER", { ...ctx, buddyName: "Sam" });
    assert.equal(p.url, "/log/2026-10-08");
    assert.equal(p.tag, "LOG_REMINDER");
    assert.equal(p.body, "Log today's workout before midnight. Missing it costs you 15 points, and Sam loses 10.");
    assert.equal(
      buildReminder("LOG_REMINDER", ctx).body,
      "Log today's workout before midnight. Missing it costs you 15 points."
    );
  });

  test("quoted penalties match the real scoring constants", () => {
    assert.equal(NOTIFICATIONS.MISSED_PENALTY_POINTS, SCORING.MISSED_PENALTY_POINTS);
    assert.equal(NOTIFICATIONS.BUDDY_PENALTY_POINTS, SCORING.BUDDY_PENALTY_POINTS);
  });
});
