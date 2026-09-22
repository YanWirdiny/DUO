import { cn } from "@/lib/utils";

/** Circular SVG progress indicator; pass `progress` in the 0..1 range. Children render centered. */
export function ProgressRing({
  progress,
  size = 64,
  strokeWidth = 6,
  color = "var(--color-accent)",
  trackColor = "var(--color-border)",
  className,
  children,
}: {
  progress: number; // 0..1
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(1, Math.max(0, progress));
  const offset = circumference * (1 - clamped);

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        {/* Full track circle, drawn under the animated progress arc. */}
        <circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        {/* Progress arc: dasharray = full circumference, dashoffset shrinks as progress grows. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
