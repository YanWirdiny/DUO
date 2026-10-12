import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/** Flat rounded panel the home screen is built from (no border or shadow, unlike `Card`). */
export function HomeCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[22px] bg-card", className)} {...props} />;
}

/** Small uppercase mono caption that names a home card ("GYM SCORE"). */
export function HomeLabel({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("font-dm-mono text-[9px] font-medium uppercase tracking-[0.72px] text-ink-faint", className)}
      {...props}
    />
  );
}

/** Signed change with an arrow: gains in brand red, losses in ink, no change in faint ink. */
export function Trend({ value, suffix = "", className }: { value: number; suffix?: string; className?: string }) {
  const tone = value > 0 ? "text-brand" : value < 0 ? "text-ink" : "text-ink-faint";
  const arrow = value > 0 ? " ↑" : value < 0 ? " ↓" : "";
  return (
    <span className={cn("tabular-nums", tone, className)}>
      {value >= 0 ? "+" : "−"}
      {Math.abs(value)}
      {suffix}
      {arrow}
    </span>
  );
}
