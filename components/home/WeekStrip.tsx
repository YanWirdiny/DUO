import { cn } from "@/lib/utils";
import type { WeekDay, WeekDayKind } from "@/lib/home";

const CIRCLE: Record<WeekDayKind, string> = {
  workout: "bg-brand text-white",
  rest: "bg-ink text-on-ink",
  today: "bg-today text-ink",
};

const KIND_LABEL: Record<WeekDayKind, string> = {
  workout: "workout day",
  rest: "rest day",
  today: "today",
};

/** Mon–Sun row of day circles: brand red for workout days, ink for rest days, grey for today. */
export function WeekStrip({ days }: { days: WeekDay[] }) {
  return (
    <ol className="flex items-start justify-between" aria-label="This week">
      {days.map((day) => {
        const d = new Date(`${day.date}T00:00:00Z`);
        const letter = d.toLocaleDateString("en-US", { weekday: "narrow", timeZone: "UTC" });
        const longDate = d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
        return (
          <li key={day.date} className="flex flex-col items-center gap-1.5" aria-label={`${longDate}, ${KIND_LABEL[day.kind]}`}>
            <span className="font-dm-mono text-[9px] font-medium text-ink-faint" aria-hidden>
              {letter}
            </span>
            <span
              className={cn("flex size-[46px] items-center justify-center rounded-full text-xs font-medium", CIRCLE[day.kind])}
              aria-hidden
            >
              {d.getUTCDate()}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
