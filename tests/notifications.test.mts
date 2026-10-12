import { after, beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { startTestDb } from "./helpers/test-db";

// Each DB-backed suite gets its own port: node --test runs files in parallel.
const testDb = await startTestDb(5435);
const { prisma } = await import("@/lib/db");
const { dateStrToUtcMidnight, weekdayOf } = await import("@/lib/dates");
const {
  countSubscriptions,
  getNotificationPreferences,
  NOTIFICATIONS,
  removeSubscription,
  saveSubscription,
  sendDueNotifications,
  updateNotificationPreferences,
} = await import("@/lib/notifications");
const { DEFAULT_PREFERENCES } = await import("@/lib/notification-rules");

type Sender = Parameters<typeof sendDueNotifications>[0];

// A fixed Thursday so every test sees the same weekday.
const DAY = "2026-10-08";
const at = (hhmm: string) => new Date(`${DAY}T${hhmm}:00Z`);

let userCount = 0;
let endpointCount = 0;

after(async () => {
  await prisma.$disconnect();
  await testDb.stop();
});

async function createUser(opts: { gymDay?: boolean; label?: string; exercises?: number; timezone?: string } = {}) {
  const user = await prisma.user.create({
    data: {
      username: `notify${++userCount}`,
      passwordHash: "x",
      displayName: `User ${userCount}`,
      timezone: opts.timezone ?? "UTC",
    },
  });
  if (opts.gymDay !== undefined) {
    await prisma.scheduleDay.create({
      data: {
        userId: user.id,
        weekday: weekdayOf(DAY),
        isGymDay: opts.gymDay,
        label: opts.label,
        exercises: { create: Array.from({ length: opts.exercises ?? 0 }, (_, i) => ({ name: `Ex ${i}`, order: i })) },
      },
    });
  }
  return user;
}

function subscription() {
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/device-${++endpointCount}`,
    p256dh: "B" + "A".repeat(86),
    auth: "A".repeat(22),
  };
}

async function addDevices(userId: string, n = 1) {
  const subs = Array.from({ length: n }, subscription);
  for (const sub of subs) assert.deepEqual(await saveSubscription(userId, sub), { ok: true });
  return subs;
}

/** A sender that records calls and answers with `outcome` (or per-endpoint overrides). */
function fakeSender(outcome: "sent" | "gone" | "failed" = "sent", overrides: Record<string, "sent" | "gone" | "failed"> = {}) {
  return mock.fn<Sender>(async (target) => overrides[target.endpoint] ?? outcome);
}

describe("notification preferences", () => {
  test("defaults until the user saves something", async () => {
    const user = await createUser();
    assert.deepEqual(await getNotificationPreferences(user.id), DEFAULT_PREFERENCES);
    assert.equal(await prisma.notificationPreference.count({ where: { userId: user.id } }), 0);
  });

  test("a partial update keeps the other fields", async () => {
    const user = await createUser();
    const first = await updateNotificationPreferences(user.id, { gymDayMinute: 7 * 60 });
    assert.deepEqual(first, { ...DEFAULT_PREFERENCES, gymDayMinute: 7 * 60 });

    const second = await updateNotificationPreferences(user.id, { logReminderEnabled: false });
    assert.deepEqual(second, { ...DEFAULT_PREFERENCES, gymDayMinute: 7 * 60, logReminderEnabled: false });
    assert.deepEqual(await getNotificationPreferences(user.id), second);
  });
});

describe("push subscriptions", () => {
  test("saving the same endpoint twice refreshes its keys instead of duplicating", async () => {
    const user = await createUser();
    const [sub] = await addDevices(user.id);
    assert.deepEqual(await saveSubscription(user.id, { ...sub, auth: "B".repeat(22) }), { ok: true });

    const rows = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].auth, "B".repeat(22));
    assert.equal(await countSubscriptions(user.id), 1);
  });

  test("a user can register at most MAX_SUBSCRIPTIONS_PER_USER devices", async () => {
    const user = await createUser();
    const subs = await addDevices(user.id, NOTIFICATIONS.MAX_SUBSCRIPTIONS_PER_USER);
    assert.deepEqual(await saveSubscription(user.id, subscription()), { ok: false, reason: "limit_reached" });
    // Refreshing a device that's already registered is still fine at the limit.
    assert.deepEqual(await saveSubscription(user.id, subs[0]), { ok: true });
    assert.equal(await countSubscriptions(user.id), NOTIFICATIONS.MAX_SUBSCRIPTIONS_PER_USER);
  });

  test("an endpoint registered by the other account moves to whoever registers it now", async () => {
    const a = await createUser();
    const b = await createUser();
    const [sub] = await addDevices(a.id);
    assert.deepEqual(await saveSubscription(b.id, sub), { ok: true });
    assert.equal(await countSubscriptions(a.id), 0);
    assert.equal(await countSubscriptions(b.id), 1);
  });

  test("knowing another user's endpoint without its keys can't take it over", async () => {
    const victim = await createUser();
    const attacker = await createUser();
    const [sub] = await addDevices(victim.id);
    for (const keys of [{ auth: "B".repeat(22) }, { p256dh: "B" + "C".repeat(86) }]) {
      assert.deepEqual(await saveSubscription(attacker.id, { ...sub, ...keys }), { ok: false, reason: "endpoint_taken" });
    }
    const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: sub.endpoint } });
    assert.equal(row.userId, victim.id);
    assert.equal(row.auth, sub.auth);
  });

  test("moving an endpoint still respects the new owner's limit", async () => {
    const a = await createUser();
    const b = await createUser();
    const [sub] = await addDevices(a.id);
    await addDevices(b.id, NOTIFICATIONS.MAX_SUBSCRIPTIONS_PER_USER);
    assert.deepEqual(await saveSubscription(b.id, sub), { ok: false, reason: "limit_reached" });
    assert.equal(await countSubscriptions(a.id), 1);
  });

  test("a user can only remove their own subscription", async () => {
    const a = await createUser();
    const b = await createUser();
    const [subA] = await addDevices(a.id);
    assert.equal(await removeSubscription(b.id, subA.endpoint), false);
    assert.equal(await countSubscriptions(a.id), 1);
    assert.equal(await removeSubscription(a.id, subA.endpoint), true);
    assert.equal(await countSubscriptions(a.id), 0);
  });
});

describe("sendDueNotifications", () => {
  // The sweep looks at every user with a device, so each test starts from a clean slate.
  beforeEach(async () => {
    await prisma.pushSubscription.deleteMany();
    await prisma.notificationDelivery.deleteMany();
  });

  test("sends the gym-day reminder to every device once, then never again that day", async () => {
    const user = await createUser({ gymDay: true, label: "Push Day", exercises: 3 });
    await addDevices(user.id, 2);
    const send = fakeSender();

    const result = await sendDueNotifications(send, at("08:05"));
    assert.deepEqual(result, { checked: 1, due: 1, sent: 2, failed: 0, removed: 0, errors: 0 });
    const payload = send.mock.calls[0].arguments[1];
    assert.equal(payload.tag, "GYM_DAY");
    assert.match(payload.body, /Push Day is on the plan today — 3 exercises/);

    const again = await sendDueNotifications(send, at("08:20"));
    assert.deepEqual(again, { checked: 1, due: 0, sent: 0, failed: 0, removed: 0, errors: 0 });
    assert.equal(send.mock.callCount(), 2);

    const deliveries = await prisma.notificationDelivery.findMany({ where: { userId: user.id } });
    assert.equal(deliveries.length, 1);
    assert.equal(deliveries[0].date.toISOString(), dateStrToUtcMidnight(DAY).toISOString());
  });

  test("overlapping cron runs still send each reminder once", async () => {
    const user = await createUser({ gymDay: true });
    await addDevices(user.id);
    const send = fakeSender();
    const results = await Promise.all([sendDueNotifications(send, at("08:05")), sendDueNotifications(send, at("08:05"))]);
    assert.equal(results[0].due + results[1].due, 1);
    assert.equal(send.mock.callCount(), 1);
  });

  test("log reminder names the buddy, whichever side of the pair the user is on", async () => {
    const a = await createUser({ gymDay: true });
    const b = await createUser({ gymDay: true });
    await prisma.buddyPair.create({ data: { userAId: a.id, userBId: b.id } });
    const [subA] = await addDevices(a.id);
    const [subB] = await addDevices(b.id);
    const send = fakeSender();

    const result = await sendDueNotifications(send, at("20:10"));
    assert.equal(result.sent, 2);
    const bodies = Object.fromEntries(send.mock.calls.map((c) => [c.arguments[0].endpoint, c.arguments[1]]));
    assert.match(bodies[subA.endpoint].body, new RegExp(`${b.displayName} loses 10`));
    assert.match(bodies[subB.endpoint].body, new RegExp(`${a.displayName} loses 10`));
    assert.equal(bodies[subA.endpoint].url, `/log/${DAY}`);
  });

  test("uses the user's timezone for both the day and the time", async () => {
    // 12:05 UTC on the 8th is 08:05 in New York (EDT) — the same Thursday.
    const user = await createUser({ gymDay: true, timezone: "America/New_York" });
    await addDevices(user.id);
    const send = fakeSender();
    assert.equal((await sendDueNotifications(send, at("08:05"))).due, 0); // 04:05 local
    assert.equal((await sendDueNotifications(send, at("12:05"))).due, 1);
  });

  test("honours custom times and disabled reminders", async () => {
    const user = await createUser({ gymDay: true });
    await updateNotificationPreferences(user.id, { gymDayMinute: 6 * 60, logReminderEnabled: false });
    await addDevices(user.id);
    const send = fakeSender();
    assert.equal((await sendDueNotifications(send, at("06:30"))).due, 1);
    assert.equal((await sendDueNotifications(send, at("20:30"))).due, 0);
  });

  test("nothing is sent on a rest day, with no schedule, once logged, or outside the windows", async () => {
    const rest = await createUser({ gymDay: false });
    const noSchedule = await createUser();
    const logged = await createUser({ gymDay: true });
    await prisma.workoutLog.create({ data: { userId: logged.id, date: dateStrToUtcMidnight(DAY) } });
    for (const u of [rest, noSchedule, logged]) await addDevices(u.id);
    const send = fakeSender();

    for (const time of ["08:05", "12:00", "20:05"]) {
      const result = await sendDueNotifications(send, at(time));
      assert.equal(result.checked, 3);
      assert.equal(result.due, 0, time);
    }
    assert.equal(send.mock.callCount(), 0);
  });

  test("users without a device aren't looked at", async () => {
    await createUser({ gymDay: true });
    const result = await sendDueNotifications(fakeSender(), at("08:05"));
    assert.equal(result.checked, 0);
  });

  test("a device the push service reports gone is deleted and not retried for the next reminder", async () => {
    const user = await createUser({ gymDay: true });
    await updateNotificationPreferences(user.id, { gymDayMinute: 19 * 60, logReminderMinute: 20 * 60 });
    const [dead, alive] = await addDevices(user.id, 2);
    const send = fakeSender("sent", { [dead.endpoint]: "gone" });

    const result = await sendDueNotifications(send, at("20:05")); // both reminders due
    assert.deepEqual(result, { checked: 1, due: 2, sent: 2, failed: 0, removed: 1, errors: 0 });
    assert.equal(send.mock.calls.filter((c) => c.arguments[0].endpoint === dead.endpoint).length, 1);
    const left = await prisma.pushSubscription.findMany({ where: { userId: user.id } });
    assert.deepEqual(left.map((s) => s.endpoint), [alive.endpoint]);
  });

  test("a failed send is counted and not retried (at most once)", async () => {
    const user = await createUser({ gymDay: true });
    await addDevices(user.id);
    const send = fakeSender("failed");
    assert.deepEqual(await sendDueNotifications(send, at("08:05")), {
      checked: 1, due: 1, sent: 0, failed: 1, removed: 0, errors: 0,
    });
    assert.equal((await sendDueNotifications(send, at("08:10"))).due, 0);
    assert.equal(await countSubscriptions(user.id), 1);
  });

  test("one broken user doesn't stop the sweep for the others", async () => {
    const broken = await createUser({ gymDay: true, timezone: "Not/AZone" });
    const fine = await createUser({ gymDay: true });
    await addDevices(broken.id);
    await addDevices(fine.id);
    const errorLog = mock.method(console, "error", () => {});
    try {
      const result = await sendDueNotifications(fakeSender(), at("08:05"));
      assert.equal(result.checked, 2);
      assert.equal(result.errors, 1);
      assert.equal(result.sent, 1);
      assert.match(String(errorLog.mock.calls[0].arguments[0]), new RegExp(broken.id));
    } finally {
      errorLog.mock.restore();
    }
  });

  test("a sender that throws a non-Error is logged and counted", async () => {
    const user = await createUser({ gymDay: true });
    await addDevices(user.id);
    const errorLog = mock.method(console, "error", () => {});
    try {
      const result = await sendDueNotifications(
        async () => {
          throw "boom";
        },
        at("08:05")
      );
      assert.equal(result.errors, 1);
      assert.equal(errorLog.mock.calls[0].arguments[1], "boom");
    } finally {
      errorLog.mock.restore();
    }
  });

  test("prunes delivery records older than the retention period", async () => {
    const user = await createUser();
    const now = at("08:05");
    const day = 24 * 60 * 60 * 1000;
    const old = new Date(now.getTime() - (NOTIFICATIONS.DELIVERY_RETENTION_DAYS + 1) * day);
    const recent = new Date(now.getTime() - day);
    await prisma.notificationDelivery.createMany({
      data: [
        { userId: user.id, type: "GYM_DAY", date: dateStrToUtcMidnight("2026-09-01"), createdAt: old },
        { userId: user.id, type: "GYM_DAY", date: dateStrToUtcMidnight("2026-10-07"), createdAt: recent },
      ],
    });
    await sendDueNotifications(fakeSender(), now);
    const left = await prisma.notificationDelivery.findMany({ where: { userId: user.id } });
    assert.deepEqual(left.map((d) => d.createdAt.toISOString()), [recent.toISOString()]);
  });

  test("defaults `now` to the current time", async () => {
    const result = await sendDueNotifications(fakeSender());
    assert.equal(result.checked, 0);
  });
});
