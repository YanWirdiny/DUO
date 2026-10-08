import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb } from "./helpers/test-db";

// Modules that touch Prisma are imported only after the test DB is up and
// DATABASE_URL points at it.
const testDb = await startTestDb();
const { prisma } = await import("@/lib/db");
const { addDays, dateStrToUtcMidnight, startOfWeek, todayInTz, weekdayOf } = await import("@/lib/dates");
const { claimLateLog, getLateLogEligibility, lateLogsRemaining, LATE_LOG, LateLogLimitError } = await import(
  "@/lib/late-log"
);
const { ensureScoresUpToDate, recomputeAfterLogChange, SCORING } = await import("@/lib/scoring");

const TZ = "UTC";
let today: string;
let yesterday: string;
let userCount = 0;

before(() => {
  today = todayInTz(TZ);
  yesterday = addDays(today, -1);
});

after(async () => {
  await prisma.$disconnect();
  await testDb.stop();
});

/** A fresh user with the given dates' weekdays marked as gym days or rest days. */
async function createUser(opts: { gymDays?: string[]; restDays?: string[]; createdDaysAgo?: number } = {}) {
  const createdAt = dateStrToUtcMidnight(addDays(today, -(opts.createdDaysAgo ?? 0)));
  const user = await prisma.user.create({
    data: {
      username: `user${++userCount}`,
      passwordHash: "x",
      displayName: `User ${userCount}`,
      timezone: TZ,
      createdAt,
    },
  });
  const days = [
    ...(opts.gymDays ?? []).map((d) => ({ weekday: weekdayOf(d), isGymDay: true })),
    ...(opts.restDays ?? []).map((d) => ({ weekday: weekdayOf(d), isGymDay: false })),
  ];
  if (days.length > 0) {
    await prisma.scheduleDay.createMany({ data: days.map((d) => ({ ...d, userId: user.id })) });
  }
  return user;
}

/** Simulates earlier late logs this week by inserting claims for other days. */
async function addClaims(userId: string, count: number, weekStart = startOfWeek(today)) {
  for (let i = 0; i < count; i++) {
    await prisma.lateLog.create({
      data: {
        userId,
        targetDate: dateStrToUtcMidnight(addDays(today, -10 - i)),
        weekStart: dateStrToUtcMidnight(weekStart),
      },
    });
  }
}

/** Mirrors what POST /api/workouts does for a late log: claim + create the log in
 * one transaction, then re-score. */
async function logLate(userId: string, date: string) {
  const eligibility = await getLateLogEligibility(userId, TZ, date);
  assert.equal(eligibility.allowed, true, "expected late log to be allowed");
  await ensureScoresUpToDate(userId);
  await prisma.$transaction(async (tx) => {
    if (eligibility.allowed && eligibility.usesAllowance) await claimLateLog(tx, userId, TZ, date);
    await tx.workoutLog.create({ data: { userId, date: dateStrToUtcMidnight(date), completed: true } });
  });
  await recomputeAfterLogChange(userId, date);
}

describe("startOfWeek", () => {
  test("returns the Monday of a Mon–Sun week", () => {
    assert.equal(startOfWeek("2026-10-05"), "2026-10-05"); // Monday
    assert.equal(startOfWeek("2026-10-07"), "2026-10-05"); // Wednesday
    assert.equal(startOfWeek("2026-10-11"), "2026-10-05"); // Sunday
    assert.equal(startOfWeek("2026-10-12"), "2026-10-12"); // next Monday
  });

  test("crosses month and year boundaries", () => {
    assert.equal(startOfWeek("2026-11-01"), "2026-10-26");
    assert.equal(startOfWeek("2027-01-01"), "2026-12-28");
  });
});

describe("getLateLogEligibility", () => {
  test("yesterday on a gym day is allowed and uses an allowance", async () => {
    const user = await createUser({ gymDays: [yesterday] });
    const result = await getLateLogEligibility(user.id, TZ, yesterday);
    assert.deepEqual(result, { allowed: true, usesAllowance: true, remaining: LATE_LOG.MAX_PER_WEEK });
  });

  test("yesterday on a rest day is allowed for free", async () => {
    const user = await createUser({ restDays: [yesterday] });
    const result = await getLateLogEligibility(user.id, TZ, yesterday);
    assert.deepEqual(result, { allowed: true, usesAllowance: false, remaining: LATE_LOG.MAX_PER_WEEK });
  });

  test("yesterday with no schedule set is allowed for free", async () => {
    const user = await createUser();
    const result = await getLateLogEligibility(user.id, TZ, yesterday);
    assert.equal(result.allowed, true);
    assert.equal(result.allowed && result.usesAllowance, false);
  });

  test("today, tomorrow and two days ago are outside the window", async () => {
    const user = await createUser({ gymDays: [today, addDays(today, 1), addDays(today, -2)] });
    for (const date of [today, addDays(today, 1), addDays(today, -2)]) {
      const result = await getLateLogEligibility(user.id, TZ, date);
      assert.deepEqual(result, { allowed: false, reason: "outside_window", remaining: 2 }, date);
    }
  });

  test("a day that already has a log is rejected", async () => {
    const user = await createUser({ gymDays: [yesterday] });
    await prisma.workoutLog.create({ data: { userId: user.id, date: dateStrToUtcMidnight(yesterday) } });
    const result = await getLateLogEligibility(user.id, TZ, yesterday);
    assert.deepEqual(result, { allowed: false, reason: "already_logged", remaining: 2 });
  });

  test("a gym day is rejected once the weekly limit is used up", async () => {
    const user = await createUser({ gymDays: [yesterday] });
    await addClaims(user.id, LATE_LOG.MAX_PER_WEEK);
    const result = await getLateLogEligibility(user.id, TZ, yesterday);
    assert.deepEqual(result, { allowed: false, reason: "limit_reached", remaining: 0 });
  });

  test("a rest day is still allowed when the weekly limit is used up", async () => {
    const user = await createUser({ restDays: [yesterday] });
    await addClaims(user.id, LATE_LOG.MAX_PER_WEEK);
    const result = await getLateLogEligibility(user.id, TZ, yesterday);
    assert.deepEqual(result, { allowed: true, usesAllowance: false, remaining: 0 });
  });

  test("re-logging a day whose allowance was already used is free (log deleted, then re-saved)", async () => {
    const user = await createUser({ gymDays: [yesterday] });
    await addClaims(user.id, LATE_LOG.MAX_PER_WEEK - 1);
    await prisma.lateLog.create({
      data: {
        userId: user.id,
        targetDate: dateStrToUtcMidnight(yesterday),
        weekStart: dateStrToUtcMidnight(startOfWeek(today)),
      },
    });
    const result = await getLateLogEligibility(user.id, TZ, yesterday);
    assert.deepEqual(result, { allowed: true, usesAllowance: false, remaining: 0 });
  });

  test("claims from last week don't count against this week", async () => {
    const user = await createUser({ gymDays: [yesterday] });
    await addClaims(user.id, LATE_LOG.MAX_PER_WEEK, addDays(startOfWeek(today), -7));
    assert.equal(await lateLogsRemaining(user.id, TZ), LATE_LOG.MAX_PER_WEEK);
    const result = await getLateLogEligibility(user.id, TZ, yesterday);
    assert.equal(result.allowed, true);
  });
});

describe("claimLateLog", () => {
  test("records the claim against the current week", async () => {
    const user = await createUser({ gymDays: [yesterday] });
    await prisma.$transaction((tx) => claimLateLog(tx, user.id, TZ, yesterday));

    const claims = await prisma.lateLog.findMany({ where: { userId: user.id } });
    assert.equal(claims.length, 1);
    assert.equal(claims[0].targetDate.toISOString(), dateStrToUtcMidnight(yesterday).toISOString());
    assert.equal(claims[0].weekStart.toISOString(), dateStrToUtcMidnight(startOfWeek(today)).toISOString());
    assert.equal(await lateLogsRemaining(user.id, TZ), LATE_LOG.MAX_PER_WEEK - 1);
  });

  test("throws at the limit and rolls back the workout log in the same transaction", async () => {
    const user = await createUser({ gymDays: [yesterday] });
    await addClaims(user.id, LATE_LOG.MAX_PER_WEEK);

    await assert.rejects(
      prisma.$transaction(async (tx) => {
        await claimLateLog(tx, user.id, TZ, yesterday);
        await tx.workoutLog.create({ data: { userId: user.id, date: dateStrToUtcMidnight(yesterday) } });
      }),
      LateLogLimitError
    );
    assert.equal(await prisma.workoutLog.count({ where: { userId: user.id } }), 0);
    assert.equal(await prisma.lateLog.count({ where: { userId: user.id } }), LATE_LOG.MAX_PER_WEEK);
  });
});

describe("late log scoring", () => {
  test("logging yesterday late reverses the missed penalty for the user and their buddy", async () => {
    const user = await createUser({ gymDays: [yesterday], createdDaysAgo: 3 });
    const buddy = await createUser();
    await prisma.buddyPair.create({ data: { userAId: user.id, userBId: buddy.id } });

    // The day ends unlogged: the lazy evaluator penalizes both.
    await ensureScoresUpToDate(user.id);
    let [u, b] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: buddy.id } }),
    ]);
    assert.equal(u.gymScore, -SCORING.MISSED_PENALTY_POINTS);
    assert.equal(b.gymScore, -SCORING.BUDDY_PENALTY_POINTS);

    await logLate(user.id, yesterday);

    [u, b] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
      prisma.user.findUniqueOrThrow({ where: { id: buddy.id } }),
    ]);
    assert.equal(u.gymScore, SCORING.BASE_COMPLETION_POINTS);
    assert.equal(u.currentStreak, 1);
    assert.equal(b.gymScore, 0);

    const events = await prisma.scoreEvent.findMany({ where: { userId: { in: [user.id, buddy.id] } } });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "STREAK_BONUS");
    assert.match(events[0].reason, /logged late/);
    assert.equal(await prisma.lateLog.count({ where: { userId: user.id } }), 1);
  });

  test("logging a rest day late doesn't use an allowance or change the score", async () => {
    const user = await createUser({ restDays: [yesterday], createdDaysAgo: 3 });

    await logLate(user.id, yesterday);

    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(u.gymScore, 0);
    assert.equal(await prisma.lateLog.count({ where: { userId: user.id } }), 0);
    assert.equal(await prisma.workoutLog.count({ where: { userId: user.id } }), 1);
  });

  test("deleting a late log doesn't refund the allowance", async () => {
    const user = await createUser({ gymDays: [yesterday], createdDaysAgo: 3 });
    await logLate(user.id, yesterday);

    await prisma.workoutLog.delete({
      where: { userId_date: { userId: user.id, date: dateStrToUtcMidnight(yesterday) } },
    });
    await recomputeAfterLogChange(user.id, yesterday);

    assert.equal(await lateLogsRemaining(user.id, TZ), LATE_LOG.MAX_PER_WEEK - 1);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(u.gymScore, -SCORING.MISSED_PENALTY_POINTS);
  });
});
