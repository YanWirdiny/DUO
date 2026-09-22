import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatFriendly, utcMidnightToDateStr } from "@/lib/dates";
import { Flame, Award, TrendingDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type EventType = "STREAK_BONUS" | "MILESTONE_BONUS" | "MISSED_PENALTY" | "BUDDY_PENALTY";

const ICONS: Record<EventType, typeof Flame> = {
  STREAK_BONUS: Flame,
  MILESTONE_BONUS: Award,
  MISSED_PENALTY: TrendingDown,
  BUDDY_PENALTY: Users,
};

/** Chronological list of score events (streak bonuses, penalties, milestones). */
export function RecentEventsFeed({
  events,
}: {
  events: { id: string; date: Date; type: EventType; points: number; reason: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>

      {events.length === 0 ? (
        <p className="py-4 text-center text-sm text-text-faint">
          Nothing yet — log a workout to start your journey.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {events.map((event) => {
            const Icon = ICONS[event.type];
            const positive = event.points > 0;
            return (
              <li key={event.id} className="flex items-center gap-3 py-2.5">
                <div
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    positive ? "bg-success-soft text-success" : "bg-danger-soft text-danger"
                  )}
                >
                  <Icon size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{event.reason}</p>
                  <p className="text-xs text-text-faint">{formatFriendly(utcMidnightToDateStr(event.date))}</p>
                </div>
                <span className={cn("text-sm font-semibold tabular-nums", positive ? "text-success" : "text-danger")}>
                  {positive ? "+" : ""}
                  {event.points}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
