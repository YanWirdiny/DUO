import Link from "next/link";
import { History } from "lucide-react";
import { HomeCard } from "./HomeCard";
import { Button } from "@/components/ui/Button";
import { LATE_LOG } from "@/lib/late-log";

/** Prompt to recover a forgotten gym day from yesterday while it's still inside the late-log window. */
export function LateLogBanner({ dateStr, dateLabel, remaining }: { dateStr: string; dateLabel: string; remaining: number }) {
  return (
    <HomeCard className="flex flex-col gap-3 p-[18px]">
      <div className="flex items-start gap-3">
        <History className="mt-0.5 shrink-0 text-brand" size={20} />
        <div>
          <h2 className="font-semibold tracking-tight text-ink">Forgot to log {dateLabel}?</h2>
          <p className="text-sm text-text-muted">
            Log it before midnight to get your points back. {remaining} of {LATE_LOG.MAX_PER_WEEK} late logs left
            this week.
          </p>
        </div>
      </div>
      <Link href={`/log/${dateStr}`}>
        <Button variant="secondary" className="w-full">
          Log {dateLabel}
        </Button>
      </Link>
    </HomeCard>
  );
}
