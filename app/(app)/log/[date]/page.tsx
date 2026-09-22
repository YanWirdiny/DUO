import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { dateStrToUtcMidnight, formatFriendly, weekdayOf } from "@/lib/dates";
import { SetLogger } from "@/components/log/SetLogger";

/** Log-a-workout page for a specific date, prefilled with the day's exercises and last-session weights. */
export default async function LogDatePage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const user = await getCurrentUser();
  if (!user) return null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return <p className="text-sm text-danger">Invalid date.</p>;
  }

  const weekday = weekdayOf(date);
  const dateValue = dateStrToUtcMidnight(date);

  const [scheduleDay, workoutLog] = await Promise.all([
    prisma.scheduleDay.findUnique({
      where: { userId_weekday: { userId: user.id, weekday } },
      include: { exercises: { orderBy: { order: "asc" } } },
    }),
    prisma.workoutLog.findUnique({
      where: { userId_date: { userId: user.id, date: dateValue } },
      include: { setLogs: true },
    }),
  ]);

  const exercises = scheduleDay?.exercises ?? [];
  const exerciseIds = exercises.map((e) => e.id);

  // Most recent prior set per exercise, used to prefill placeholders (e.g. "last time: 135 lb").
  const lastSets = exerciseIds.length
    ? await prisma.setLog.findMany({
        where: { exerciseId: { in: exerciseIds }, workoutLog: { userId: user.id, date: { lt: dateValue } } },
        orderBy: [{ workoutLog: { date: "desc" } }, { weight: "desc" }],
        distinct: ["exerciseId"],
      })
    : [];
  const lastByExercise = new Map(lastSets.map((s) => [s.exerciseId, s]));

  const logExercises = exercises.map((ex) => ({
    id: ex.id,
    name: ex.name,
    targetSets: ex.targetSets,
    targetReps: ex.targetReps,
    lastWeight: lastByExercise.get(ex.id)?.weight ?? null,
    lastReps: lastByExercise.get(ex.id)?.reps ?? null,
  }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/" className="mb-2 inline-flex items-center gap-1 text-sm text-text-muted hover:text-text">
          <ChevronLeft size={16} /> Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{scheduleDay?.label || "Workout"}</h1>
        <p className="text-sm text-text-muted">{formatFriendly(date)}</p>
      </div>

      {exercises.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-muted">
          No exercises are set for this day yet.{" "}
          <Link href="/program" className="font-medium text-accent hover:underline">
            Add some in your program
          </Link>
          .
        </p>
      ) : (
        <SetLogger
          date={date}
          scheduleDayId={scheduleDay?.id ?? null}
          exercises={logExercises}
          initialSets={workoutLog?.setLogs ?? []}
          hasExistingLog={!!workoutLog}
        />
      )}
    </div>
  );
}
