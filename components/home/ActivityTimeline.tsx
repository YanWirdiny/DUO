import { formatFriendly, utcMidnightToDateStr } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { HomeCard } from "./HomeCard";

/** Recent score events: reason, date, and points (gains in brand red, losses in ink). */
export function ActivityTimeline({ events }: { events: { id: string; date: Date; points: number; reason: string }[] }) {
  return (
    <HomeCard className="flex flex-col gap-2.5 px-4 pb-3 pt-[18px]">
      <h2 className="text-[17px] font-bold tracking-[-0.17px] text-ink">Recent Activity</h2>

      {events.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-ink-faint">Nothing yet — log a workout to start your journey.</p>
      ) : (
        <ul className="flex flex-col">
          {events.map((event) => (
            <li key={event.id} className="flex h-11 items-center gap-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="truncate text-[13px] font-medium text-ink">{event.reason}</p>
                <p className="font-dm-mono text-[9px] uppercase tracking-[0.36px] text-ink-faint">
                  {formatFriendly(utcMidnightToDateStr(event.date))}
                </p>
              </div>
              <span className={cn("text-sm font-bold tabular-nums", event.points > 0 ? "text-brand" : "text-ink")}>
                {event.points > 0 ? "+" : ""}
                {event.points}
              </span>
            </li>
          ))}
        </ul>
      )}
    </HomeCard>
  );
}
