import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/** Rounded surface container used as the base for dashboard/list cards. */
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-3xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)]",
        className
      )}
      {...props}
    />
  );
}

/** Row layout for a card's title + trailing action, placed above the card body. */
export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex items-center justify-between gap-3", className)} {...props} />;
}

/** Muted, small-caps-style heading text for a `CardHeader`. */
export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn("text-sm font-semibold tracking-tight text-text-muted", className)} {...props} />
  );
}
