import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CheckCircle2, Circle, CalendarOff } from "lucide-react";

type Exercise = { id: string; name: string; targetSets: number; targetReps: number };

/** Today's workout summary: rest-day state, exercise list, or a link to log the workout. */
export function TodayCard({
  dateLabel,
  dateStr,
  isGymDay,
  dayLabel,
  exercises,
  completed,
}: {
  dateLabel: string;
  dateStr: string;
  isGymDay: boolean;
  dayLabel: string | null;
  exercises: Exercise[];
  completed: boolean;
}) {
  if (!isGymDay) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{dateLabel}</CardTitle>
          <Badge tone="neutral">Rest day</Badge>
        </CardHeader>
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CalendarOff className="text-text-faint" size={28} />
          <p className="text-sm text-text-muted">No workout scheduled today. Enjoy the recovery.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{dateLabel}</CardTitle>
          <h2 className="text-lg font-semibold tracking-tight">{dayLabel || "Today's Workout"}</h2>
        </div>
        <Badge tone={completed ? "success" : "ember"}>
          {completed ? (
            <>
              <CheckCircle2 size={12} /> Logged
            </>
          ) : (
            <>
              <Circle size={12} /> Not logged
            </>
          )}
        </Badge>
      </CardHeader>

      <ul className="mb-5 flex flex-col divide-y divide-border">
        {exercises.map((ex) => (
          <li key={ex.id} className="flex items-center justify-between py-2.5 text-sm">
            <span className="font-medium">{ex.name}</span>
            <span className="text-text-faint">
              {ex.targetSets} × {ex.targetReps}
            </span>
          </li>
        ))}
        {exercises.length === 0 && (
          <li className="py-2.5 text-sm text-text-faint">No exercises added yet for this day.</li>
        )}
      </ul>

      <Link href={`/log/${dateStr}`}>
        <Button size="lg" className="w-full" variant={completed ? "secondary" : "primary"}>
          {completed ? "Edit today's log" : "Log today's workout"}
        </Button>
      </Link>
    </Card>
  );
}
