import type { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { dateStrToUtcMidnight, nowInTz, weekdayOf } from "@/lib/dates";
import {
  buildReminder,
  DEFAULT_PREFERENCES,
  dueReminders,
  NOTIFICATIONS,
  type NotificationPreferences,
  type PushPayload,
} from "@/lib/notification-rules";
import type { PushTarget, SendResult } from "@/lib/push";

export { NOTIFICATIONS };

/** The user's reminder settings; defaults until they change something. */
export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const row = await prisma.notificationPreference.findUnique({ where: { userId } });
  if (!row) return { ...DEFAULT_PREFERENCES };
  const { gymDayEnabled, gymDayMinute, logReminderEnabled, logReminderMinute } = row;
  return { gymDayEnabled, gymDayMinute, logReminderEnabled, logReminderMinute };
}

/** Saves any subset of the settings (creating the row on first change). */
export async function updateNotificationPreferences(
  userId: string,
  patch: Partial<NotificationPreferences>
): Promise<NotificationPreferences> {
  const row = await prisma.notificationPreference.upsert({
    where: { userId },
    create: { ...DEFAULT_PREFERENCES, ...patch, userId },
    update: patch,
  });
  const { gymDayEnabled, gymDayMinute, logReminderEnabled, logReminderMinute } = row;
  return { gymDayEnabled, gymDayMinute, logReminderEnabled, logReminderMinute };
}

/**
 * Registers (or refreshes) this device for the user. An endpoint belongs to one
 * browser profile, so if it was registered under the other account (someone
 * logged out and back in as the other user on the same device) it moves to the
 * current user: notifications follow whoever is signed in there now.
 *
 * Moving it requires the same p256dh/auth keys the endpoint was registered
 * with. Only the browser holding that subscription knows them, so knowing
 * someone's endpoint URL alone isn't enough to take over their device.
 */
export async function saveSubscription(
  userId: string,
  sub: PushTarget
): Promise<{ ok: true } | { ok: false; reason: "limit_reached" | "endpoint_taken" }> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.pushSubscription.findUnique({ where: { endpoint: sub.endpoint } });
    if (existing && existing.userId !== userId && (existing.p256dh !== sub.p256dh || existing.auth !== sub.auth)) {
      return { ok: false, reason: "endpoint_taken" };
    }
    if (existing?.userId !== userId) {
      const count = await tx.pushSubscription.count({ where: { userId } });
      if (count >= NOTIFICATIONS.MAX_SUBSCRIPTIONS_PER_USER) return { ok: false, reason: "limit_reached" };
    }
    await tx.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: { userId, ...sub },
      update: { userId, p256dh: sub.p256dh, auth: sub.auth },
    });
    return { ok: true };
  });
}

/** Removes one of the user's devices. Another user's endpoint is never touched. */
export async function removeSubscription(userId: string, endpoint: string): Promise<boolean> {
  const { count } = await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return count > 0;
}

/** Number of devices the user has notifications turned on for. */
export async function countSubscriptions(userId: string): Promise<number> {
  return prisma.pushSubscription.count({ where: { userId } });
}

/**
 * Reserves the (user, type, day) slot with INSERT … ON CONFLICT DO NOTHING.
 * Returns false if it was already taken, which is how a second cron run (or two
 * overlapping ones) skips the reminder. Atomic in Postgres, so no race window.
 */
async function claimDelivery(userId: string, type: NotificationType, date: Date): Promise<boolean> {
  const { count } = await prisma.notificationDelivery.createMany({
    data: [{ userId, type, date }],
    skipDuplicates: true,
  });
  return count === 1;
}

export type SweepResult = {
  /** Users with at least one device. */
  checked: number;
  /** Reminders claimed this run (each goes to every device of that user). */
  due: number;
  sent: number;
  failed: number;
  /** Subscriptions deleted because the push service reported them gone. */
  removed: number;
  /** Users skipped because something about them threw (e.g. a bad timezone). */
  errors: number;
};

type Sender = (target: PushTarget, payload: PushPayload) => Promise<SendResult>;

/**
 * The cron entry point. For every user with a registered device, works out
 * their local day and time, sends whichever reminders are due, and records each
 * one so it's sent at most once per day. Delivery is claimed before sending:
 * a reminder that fails to send isn't retried (at-most-once beats spamming).
 */
export async function sendDueNotifications(send: Sender, now: Date = new Date()): Promise<SweepResult> {
  const result: SweepResult = { checked: 0, due: 0, sent: 0, failed: 0, removed: 0, errors: 0 };

  const users = await prisma.user.findMany({
    where: { pushSubscriptions: { some: {} } },
    select: {
      id: true,
      timezone: true,
      notificationPreference: true,
      pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
      pairAsUserA: { select: { userB: { select: { displayName: true } } } },
      pairAsUserB: { select: { userA: { select: { displayName: true } } } },
    },
  });

  for (const user of users) {
    result.checked++;
    try {
      const { date, minute } = nowInTz(user.timezone, now);
      const dateValue = dateStrToUtcMidnight(date);
      const [scheduleDay, log] = await Promise.all([
        prisma.scheduleDay.findUnique({
          where: { userId_weekday: { userId: user.id, weekday: weekdayOf(date) } },
          select: { isGymDay: true, label: true, _count: { select: { exercises: true } } },
        }),
        prisma.workoutLog.findUnique({
          where: { userId_date: { userId: user.id, date: dateValue } },
          select: { id: true },
        }),
      ]);

      // Rest day, no schedule, or already logged: nothing to remind about.
      if (!scheduleDay?.isGymDay || log) continue;

      const types = dueReminders({
        prefs: user.notificationPreference ?? DEFAULT_PREFERENCES,
        minute,
        isGymDay: true,
        loggedToday: false,
      });

      const gone = new Set<string>();
      for (const type of types) {
        if (!(await claimDelivery(user.id, type, dateValue))) continue;
        result.due++;

        const payload = buildReminder(type, {
          date,
          label: scheduleDay.label,
          exerciseCount: scheduleDay._count.exercises,
          buddyName: user.pairAsUserA?.userB.displayName ?? user.pairAsUserB?.userA.displayName ?? null,
        });

        for (const device of user.pushSubscriptions) {
          if (gone.has(device.id)) continue;
          const outcome = await send(device, payload);
          if (outcome === "sent") result.sent++;
          else if (outcome === "failed") result.failed++;
          else {
            await prisma.pushSubscription.deleteMany({ where: { id: device.id } });
            gone.add(device.id);
            result.removed++;
          }
        }
      }
    } catch (err) {
      result.errors++;
      console.error(`[notifications] skipped user ${user.id}:`, err instanceof Error ? err.message : err);
    }
  }

  const cutoff = new Date(now.getTime() - NOTIFICATIONS.DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  await prisma.notificationDelivery.deleteMany({ where: { createdAt: { lt: cutoff } } });

  return result;
}
