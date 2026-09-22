import { cn } from "@/lib/utils";

/** Flame icon used to represent an active streak; dims to a faint outline when inactive. */
export function StreakFlame({ active = true, className }: { active?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={cn("h-5 w-5", active ? "text-ember" : "text-text-faint", className)}
    >
      <path
        d="M12 2c.6 2.4-.4 3.8-1.6 5.2C9 8.8 7.5 10.6 7.5 13a4.5 4.5 0 0 0 9 0c0-1.2-.4-2-1-2.8-.2 1.4-1 2.2-1.8 2.2-1 0-1.7-.8-1.7-1.8 0-1.4 1.2-2.3 1.2-4.2 0-1.8-1-3.2-1.2-4.4Z"
        fill="currentColor"
      />
    </svg>
  );
}
