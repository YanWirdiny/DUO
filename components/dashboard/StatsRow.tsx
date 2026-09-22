import { Card } from "@/components/ui/Card";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { StreakFlame } from "@/components/ui/StreakFlame";
import { Trophy } from "lucide-react";

/** Two-up summary card row showing total gym score and current/longest streak. */
export function StatsRow({
  gymScore,
  currentStreak,
  longestStreak,
}: {
  gymScore: number;
  currentStreak: number;
  longestStreak: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Card className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-text-muted">
          <Trophy size={14} />
          <span className="text-xs font-medium">Gym Score</span>
        </div>
        <AnimatedNumber value={gymScore} className="text-3xl font-semibold tracking-tight text-accent" />
      </Card>

      <Card className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-text-muted">
          <StreakFlame active={currentStreak > 0} />
          <span className="text-xs font-medium">Current Streak</span>
        </div>
        <div className="flex items-baseline gap-2">
          <AnimatedNumber value={currentStreak} className="text-3xl font-semibold tracking-tight text-accent" />
          <span className="text-xs text-text-faint">best {longestStreak}</span>
        </div>
      </Card>
    </div>
  );
}
