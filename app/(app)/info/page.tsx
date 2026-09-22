import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBuddyId } from "@/lib/buddy";
import { utcMidnightToDateStr } from "@/lib/dates";
import { ExerciseProgressCard } from "@/components/progress/ExerciseProgressCard";
import { BuddyProfileCard } from "@/components/buddy/BuddyProfileCard";
import { PairingPanel } from "@/components/buddy/PairingPanel";
import { Card } from "@/components/ui/Card";

/** Per-exercise load progression charts, plus the buddy connection panel/status. */
export default async function InfoPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [exercises, buddyId] = await Promise.all([
    prisma.exercise.findMany({
      where: { scheduleDay: { userId: user.id } },
      include: {
        setLogs: { include: { workoutLog: true } },
        scheduleDay: true,
      },
      orderBy: { name: "asc" },
    }),
    getBuddyId(user.id),
  ]);
  const buddy = buddyId ? await prisma.user.findUnique({ where: { id: buddyId } }) : null;

  // Daily max weight per exercise (for the progress chart) plus each exercise's all-time PR.
  const withData = exercises
    .map((ex) => {
      const byDate = new Map<string, number>();
      for (const set of ex.setLogs) {
        const date = utcMidnightToDateStr(set.workoutLog.date);
        byDate.set(date, Math.max(byDate.get(date) ?? 0, set.weight));
      }
      const points = [...byDate.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, weight]) => ({ date, weight }));

      const prWeight = ex.setLogs.reduce((max, set) => Math.max(max, set.weight), 0);

      return { id: ex.id, name: ex.name, points, prWeight };
    })
    .filter((ex) => ex.points.length > 0);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Info</h1>
        <p className="text-sm text-text-muted">Your progress and your gym buddy, all in one place.</p>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Progress</h2>
          <p className="text-sm text-text-muted">Load progression for every exercise you&apos;ve logged.</p>
        </div>

        {withData.length === 0 ? (
          <Card>
            <p className="py-6 text-center text-sm text-text-faint">
              Log a few workouts and your load progression will show up here.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {withData.map((ex) => (
              <ExerciseProgressCard key={ex.id} name={ex.name} points={ex.points} prWeight={ex.prWeight} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Buddy</h2>
          <p className="text-sm text-text-muted">
            {buddy
              ? "You're connected. Missed days cost you both — keep each other honest."
              : "Connect with your gym buddy to share accountability."}
          </p>
        </div>

        {buddy ? <BuddyProfileCard buddy={buddy} /> : <PairingPanel />}
      </section>
    </div>
  );
}
