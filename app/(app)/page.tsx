import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBuddyId } from "@/lib/buddy";
import { ensureScoresUpToDate } from "@/lib/scoring";
import {
  todayInTz,
  dateStrToUtcMidnight,
  utcMidnightToDateStr,
  formatFriendly,
  addDays,
  startOfWeek,
} from "@/lib/dates";
import { getLateLogEligibility } from "@/lib/late-log";
import { buildWeekStrip, loadSessionVolumes, summarizeEffort, weeklyScoreChange } from "@/lib/home";
import { WeekStrip } from "@/components/home/WeekStrip";
import { GymScoreCard } from "@/components/home/GymScoreCard";
import { BuddyScoreCard } from "@/components/home/BuddyScoreCard";
import { EffortCard } from "@/components/home/EffortCard";
import { ActivityTimeline } from "@/components/home/ActivityTimeline";
import { LateLogBanner } from "@/components/home/LateLogBanner";

/** Home: this week at a glance, gym and buddy scores, lifetime effort, and recent score events. */
export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) return null; // layout already guards this

  const today = todayInTz(user.timezone);
  const weekStart = startOfWeek(today);
  const yesterday = addDays(today, -1);

  const [gymDays, weekLogs, buddyId, recentEvents, yesterdayEligibility, weekChange, sessions] = await Promise.all([
    prisma.scheduleDay.findMany({ where: { userId: user.id, isGymDay: true }, select: { weekday: true } }),
    prisma.workoutLog.findMany({
      where: { userId: user.id, completed: true, date: { gte: dateStrToUtcMidnight(weekStart) } },
      select: { date: true },
    }),
    getBuddyId(user.id),
    prisma.scoreEvent.findMany({
      where: { userId: user.id },
      orderBy: { date: "desc" },
      take: 6,
    }),
    getLateLogEligibility(user.id, user.timezone, yesterday),
    weeklyScoreChange(user.id, weekStart),
    loadSessionVolumes(user.id),
  ]);

  const loggedDates = new Set(weekLogs.map((l) => utcMidnightToDateStr(l.date)));
  const week = buildWeekStrip(today, weekStart, new Set(gymDays.map((d) => d.weekday)), loggedDates);

  let buddyData = null;
  if (buddyId) {
    // Catch up the buddy's score too, so what's shown here is current.
    await ensureScoresUpToDate(buddyId);
    const buddy = await prisma.user.findUnique({ where: { id: buddyId } });
    if (buddy) {
      buddyData = {
        displayName: buddy.displayName,
        gymScore: buddy.gymScore,
        // The buddy's own week, in their timezone.
        weekChange: await weeklyScoreChange(buddy.id, startOfWeek(todayInTz(buddy.timezone))),
      };
    }
  }

  return (
    <div className="flex flex-col gap-[18px] font-dm">
      <header className="flex items-center justify-between">
        <h1 className="text-[26px] font-bold tracking-[-0.52px] text-ink">Home</h1>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex size-8 items-center justify-center rounded-full bg-chip text-[13px] font-bold text-ink"
        >
          {user.displayName.slice(0, 1).toUpperCase()}
        </Link>
      </header>

      <WeekStrip days={week} />

      <GymScoreCard gymScore={user.gymScore} weekChange={weekChange} todayStr={today} loggedToday={loggedDates.has(today)} />

      {/* Only surface it for a missed gym day; a rest day has no penalty to recover. */}
      {yesterdayEligibility.allowed && yesterdayEligibility.usesAllowance && (
        <LateLogBanner
          dateStr={yesterday}
          dateLabel={formatFriendly(yesterday)}
          remaining={yesterdayEligibility.remaining}
        />
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <BuddyScoreCard buddy={buddyData} />
        <EffortCard effort={summarizeEffort(sessions, weekStart)} />
      </div>

      <ActivityTimeline events={recentEvents} />
    </div>
  );
}
