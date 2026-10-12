import { cn } from "@/lib/utils";
import { formatVolume, HOME, type EffortSummary, type SessionVolume } from "@/lib/home";
import { HomeCard, HomeLabel, Trend } from "./HomeCard";

/** Below this share of the tallest bar, a non-zero fill is raised so its rounded cap stays visible. */
const MIN_FILL_PCT = 8;

/**
 * Volume (weight × reps) of the most recent sessions as bars, newest in brand red,
 * with the lifetime total and the share of it added this week underneath.
 */
export function EffortCard({ effort }: { effort: EffortSummary }) {
  const max = Math.max(0, ...effort.bars.map((b) => b.volume));
  // Left-pad with empty slots so the newest session always sits on the right.
  const slots: (SessionVolume | null)[] = [
    ...Array<null>(HOME.EFFORT_BARS - effort.bars.length).fill(null),
    ...effort.bars,
  ];
  const last = slots.length - 1;

  return (
    <HomeCard className="flex flex-col gap-3 px-4 pb-[18px] pt-4">
      <HomeLabel>Overall effort</HomeLabel>

      <div className="flex min-h-0 flex-1 flex-col gap-[7px]">
        <div className="flex min-h-[109px] flex-1 justify-between px-0.5" role="img" aria-label={chartLabel(effort.bars)}>
          {slots.map((slot, i) => {
            const pct = slot && max > 0 ? Math.max((slot.volume / max) * 100, slot.volume > 0 ? MIN_FILL_PCT : 0) : 0;
            return (
              <div key={slot?.date ?? `empty-${i}`} className="relative w-2.5 overflow-hidden rounded-[5px] bg-track">
                <div
                  className={cn("absolute inset-x-0 bottom-0 rounded-[5px]", i === last ? "bg-brand" : "bg-ink")}
                  style={{ height: `${pct}%` }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between font-dm-mono text-[8px] font-medium" aria-hidden>
          {slots.map((slot, i) => (
            <span key={slot?.date ?? `empty-${i}`} className={cn("h-2.5 w-3.5 text-center", i === last ? "text-brand" : "text-ink")}>
              {slot ? Number(slot.date.slice(8)) : ""}
            </span>
          ))}
        </div>
      </div>

      <p className="flex items-baseline gap-1.5 whitespace-nowrap text-ink">
        <span className="text-[15px] font-bold tabular-nums">{formatVolume(effort.total)}</span>
        <span className="text-xs">
          lbs lifted
          {effort.growthPct !== null && (
            <>
              &nbsp;&nbsp;
              <Trend value={effort.growthPct} suffix="%" />
            </>
          )}
        </span>
      </p>
    </HomeCard>
  );
}

/** Screen-reader summary of the bars, since the chart itself is purely visual. */
function chartLabel(bars: SessionVolume[]): string {
  if (bars.length === 0) return "No sessions logged yet";
  const list = bars.map((b) => `${b.date}: ${formatVolume(b.volume)} lbs`).join(", ");
  return `Volume of the last ${bars.length} sessions. ${list}`;
}
