import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { WEEKDAY_LABELS, WEEKDAY_ORDER, todayInTz, weekdayOf } from "@/lib/dates";
import { DayCard } from "@/components/program/DayCard";

export default async function ProgramPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const days = await prisma.scheduleDay.findMany({
    where: { userId: user.id },
    include: { exercises: { orderBy: { order: "asc" } } },
  });
  const byWeekday = new Map(days.map((d) => [d.weekday, d]));
  const todayWeekday = weekdayOf(todayInTz(user.timezone));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your Program</h1>
        <p className="text-sm text-text-muted">Set your weekly gym days and the exercises for each.</p>
      </div>

      <div className="flex flex-col gap-3">
        {WEEKDAY_ORDER.map((weekday) => {
          const day = byWeekday.get(weekday);
          if (!day) return null;
          return (
            <DayCard
              key={weekday}
              weekdayLabel={WEEKDAY_LABELS[weekday]}
              day={day}
              defaultOpen={weekday === todayWeekday}
            />
          );
        })}
      </div>
    </div>
  );
}
