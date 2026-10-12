import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb } from "./helpers/test-db";

// Modules that touch Prisma are imported only after the test DB is up.
const testDb = await startTestDb(5437);
const { prisma } = await import("@/lib/db");
const { addDays, dateStrToUtcMidnight, startOfWeek, todayInTz, weekdayOf } = await import("@/lib/dates");
const { buildWeekStrip, formatVolume, HOME, loadSessionVolumes, summarizeEffort, weeklyScoreChange } = await import(
  "@/lib/home"
);

let userCount = 0;

after(async () => {
  await prisma.$disconnect();
  await testDb.stop();
});

async function createUser() {
  return prisma.user.create({
    data: { username: `home${++userCount}`, passwordHash: "x", displayName: `Home ${userCount}`, timezone: "UTC" },
  });
}

describe("buildWeekStrip", () => {
  // 2026-10-14 is a Wednesday; its week runs Mon 12 → Sun 18.
  const today = "2026-10-14";
  const weekStart = startOfWeek(today);

  test("returns Mon–Sun of the current week", () => {
    const days = buildWeekStrip(today, weekStart, new Set(), new Set());
    assert.deepEqual(
      days.map((d) => d.date),
      ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]
    );
  });

  test("past days follow logs, today is today, future days follow the schedule", () => {
    const gym = new Set([weekdayOf("2026-10-12"), weekdayOf("2026-10-13"), weekdayOf("2026-10-16")]);
    // Monday was a missed gym day; Tuesday was logged.
    const logged = new Set(["2026-10-13"]);
    const kinds = buildWeekStrip(today, weekStart, gym, logged).map((d) => d.kind);
    assert.deepEqual(kinds, ["rest", "workout", "today", "rest", "workout", "rest", "rest"]);
  });

  test("an off-schedule log in the past still counts as a workout day", () => {
    const days = buildWeekStrip(today, weekStart, new Set(), new Set(["2026-10-12"]));
    assert.equal(days[0].kind, "workout");
  });

  test("today stays 'today' even when it's logged", () => {
    const days = buildWeekStrip(today, weekStart, new Set([weekdayOf(today)]), new Set([today]));
    assert.equal(days[2].kind, "today");
  });
});

describe("summarizeEffort", () => {
  const weekStart = "2026-10-12";

  test("no sessions", () => {
    assert.deepEqual(summarizeEffort([], weekStart), { bars: [], total: 0, growthPct: null });
  });

  test("keeps only the last bars, totals everything, and measures this week's growth", () => {
    const sessions = Array.from({ length: 10 }, (_, i) => ({ date: addDays("2026-10-01", i), volume: 100 }));
    const s = summarizeEffort(sessions, weekStart);
    assert.equal(s.bars.length, HOME.EFFORT_BARS);
    assert.equal(s.bars.at(-1)!.date, "2026-10-10");
    assert.equal(s.total, 1000);
    // Nothing logged on/after the week start.
    assert.equal(s.growthPct, 0);
  });

  test("the week start itself counts as this week", () => {
    const s = summarizeEffort(
      [
        { date: "2026-10-05", volume: 1000 },
        { date: "2026-10-12", volume: 80 },
      ],
      weekStart
    );
    assert.equal(s.growthPct, 8);
  });

  test("growth is null when everything was lifted this week", () => {
    assert.equal(summarizeEffort([{ date: "2026-10-13", volume: 500 }], weekStart).growthPct, null);
  });
});

describe("formatVolume", () => {
  test("compacts thousands and millions, trims .0", () => {
    assert.equal(formatVolume(0), "0");
    assert.equal(formatVolume(950.4), "950");
    assert.equal(formatVolume(1000), "1k");
    assert.equal(formatVolume(12_400), "12.4k");
    assert.equal(formatVolume(1_250_000), "1.3M");
  });
});

describe("loadSessionVolumes", () => {
  test("sums weight × reps per completed session, oldest first, including empty sessions", async () => {
    const user = await createUser();
    const day = await prisma.scheduleDay.create({ data: { userId: user.id, weekday: "MON" } });
    const ex = await prisma.exercise.create({ data: { scheduleDayId: day.id, name: "Squat" } });

    const newer = await prisma.workoutLog.create({ data: { userId: user.id, date: dateStrToUtcMidnight("2026-10-08") } });
    const older = await prisma.workoutLog.create({ data: { userId: user.id, date: dateStrToUtcMidnight("2026-10-06") } });
    await prisma.workoutLog.create({ data: { userId: user.id, date: dateStrToUtcMidnight("2026-10-07") } }); // no sets
    const incomplete = await prisma.workoutLog.create({
      data: { userId: user.id, date: dateStrToUtcMidnight("2026-10-09"), completed: false },
    });
    await prisma.setLog.createMany({
      data: [
        { workoutLogId: older.id, exerciseId: ex.id, setNumber: 1, weight: 100, reps: 5 },
        { workoutLogId: older.id, exerciseId: ex.id, setNumber: 2, weight: 102.5, reps: 4 },
        { workoutLogId: newer.id, exerciseId: ex.id, setNumber: 1, weight: 135, reps: 10 },
        { workoutLogId: incomplete.id, exerciseId: ex.id, setNumber: 1, weight: 999, reps: 1 },
      ],
    });

    // Another user's sessions never leak in.
    const other = await createUser();
    await prisma.workoutLog.create({ data: { userId: other.id, date: dateStrToUtcMidnight("2026-10-06") } });

    assert.deepEqual(await loadSessionVolumes(user.id), [
      { date: "2026-10-06", volume: 910 },
      { date: "2026-10-07", volume: 0 },
      { date: "2026-10-08", volume: 1350 },
    ]);
  });

  test("a user with no sessions gets an empty list", async () => {
    const user = await createUser();
    assert.deepEqual(await loadSessionVolumes(user.id), []);
  });
});

describe("weeklyScoreChange", () => {
  let today: string;
  before(() => {
    today = todayInTz("UTC");
  });

  test("nets bonuses and penalties dated on or after the week start", async () => {
    const user = await createUser();
    const weekStart = startOfWeek(today);
    await prisma.scoreEvent.createMany({
      data: [
        { userId: user.id, date: dateStrToUtcMidnight(weekStart), type: "STREAK_BONUS", points: 10, reason: "a" },
        { userId: user.id, date: dateStrToUtcMidnight(today), type: "MISSED_PENALTY", points: -15, reason: "b" },
        { userId: user.id, date: dateStrToUtcMidnight(today), type: "MILESTONE_BONUS", points: 35, reason: "c" },
        { userId: user.id, date: dateStrToUtcMidnight(addDays(weekStart, -1)), type: "STREAK_BONUS", points: 100, reason: "old" },
      ],
    });
    assert.equal(await weeklyScoreChange(user.id, weekStart), 30);
  });

  test("zero when there are no events", async () => {
    const user = await createUser();
    assert.equal(await weeklyScoreChange(user.id, startOfWeek(today)), 0);
  });
});
