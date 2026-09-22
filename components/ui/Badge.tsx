import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

type Tone = "accent" | "success" | "danger" | "neutral" | "ember";

const toneClasses: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent-strong",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  neutral: "bg-surface-raised text-text-muted",
  ember: "bg-ember-soft text-ember",
};

/** Small pill label; `tone` picks the color pairing (accent, success, danger, neutral, ember). */
export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
        toneClasses[tone],
        className
      )}
      {...props}
    />
  );
}
