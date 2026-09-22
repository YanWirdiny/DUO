import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBuddyId } from "@/lib/buddy";
import { ensureScoresUpToDate } from "@/lib/scoring";
import { todayInTz, weekdayOf, dateStrToUtcMidnight, formatFriendly } from "@/lib/dates";
import { StatsRow } from "@/components/dashboard/StatsRow";
import { TodayCard } from "@/components/dashboard/TodayCard";
import { BuddyStatusCard } from "@/components/dashboard/BuddyStatusCard";
import { RecentEventsFeed } from "@/components/dashboard/RecentEventsFeed";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) return null; // layout already guards this

  const today = todayInTz(user.timezone);
  const weekday = weekdayOf(today);
  const todayDate = dateStrToUtcMidnight(today);

  const [scheduleDay, workoutLog, buddyId, recentEvents] = await Promise.all([
    prisma.scheduleDay.findUnique({
      where: { userId_weekday: { userId: user.id, weekday } },
      include: { exercises: { orderBy: { order: "asc" } } },
    }),
    prisma.workoutLog.findUnique({ where: { userId_date: { userId: user.id, date: todayDate } } }),
    getBuddyId(user.id),
    prisma.scoreEvent.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 6,
    }),
  ]);

  let buddyData = null;
  if (buddyId) {
    await ensureScoresUpToDate(buddyId);
    const buddy = await prisma.user.findUnique({ where: { id: buddyId } });
    if (buddy) {
      const buddyToday = todayInTz(buddy.timezone);
      const buddyWeekday = weekdayOf(buddyToday);
      const [buddySchedule, buddyLog] = await Promise.all([
        prisma.scheduleDay.findUnique({
          where: { userId_weekday: { userId: buddy.id, weekday: buddyWeekday } },
        }),
        prisma.workoutLog.findUnique({
          where: { userId_date: { userId: buddy.id, date: dateStrToUtcMidnight(buddyToday) } },
        }),
      ]);
      buddyData = {
        displayName: buddy.displayName,
        avatarColor: buddy.avatarColor,
        gymScore: buddy.gymScore,
        currentStreak: buddy.currentStreak,
        isGymDayToday: buddySchedule?.isGymDay ?? false,
        loggedToday: !!buddyLog?.completed,
      };
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-text-muted">Welcome back,</p>
        <h1 className="text-2xl font-semibold tracking-tight">{user.displayName}</h1>
      </div>

      <StatsRow gymScore={user.gymScore} currentStreak={user.currentStreak} longestStreak={user.longestStreak} />

      <TodayCard
        dateLabel={formatFriendly(today)}
        dateStr={today}
        isGymDay={scheduleDay?.isGymDay ?? false}
        dayLabel={scheduleDay?.label ?? null}
        exercises={scheduleDay?.exercises ?? []}
        completed={!!workoutLog?.completed}
      />

      <BuddyStatusCard buddy={buddyData} />

      <RecentEventsFeed events={recentEvents} />
    </div>
  );
}
