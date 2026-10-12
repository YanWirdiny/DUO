import Link from "next/link";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { HomeCard, HomeLabel, Trend } from "./HomeCard";

/** The user's gym score with this week's change, beside the big Log button for today. */
export function GymScoreCard({
  gymScore,
  weekChange,
  todayStr,
  loggedToday,
}: {
  gymScore: number;
  weekChange: number;
  todayStr: string;
  loggedToday: boolean;
}) {
  return (
    <HomeCard className="flex items-center gap-4 p-[18px]">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <HomeLabel>Gym score</HomeLabel>
        <AnimatedNumber value={gymScore} className="text-[40px] font-bold leading-none tracking-[-1.6px] text-ink" />
        <p className="text-xs text-ink">
          This week&nbsp;&nbsp;
          <Trend value={weekChange} />
        </p>
      </div>
      <Link
        href={`/log/${todayStr}`}
        aria-label={loggedToday ? "Edit today's workout log" : "Log today's workout"}
        className="flex h-[92px] w-[103px] shrink-0 items-center justify-center rounded-full bg-ink text-[32px] font-bold text-on-ink transition-transform active:scale-95"
      >
        {loggedToday ? "Edit" : "Log"}
      </Link>
    </HomeCard>
  );
}
