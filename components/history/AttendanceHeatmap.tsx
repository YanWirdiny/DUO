import { cn } from "@/lib/utils";
import { formatFriendly, weekdayOf } from "@/lib/dates";
import type { AttendanceDay } from "@/lib/attendance";

const WEEKDAY_HEADERS = ["M", "T", "W", "T", "F", "S", "S"];

const STATUS_CLASSES: Record<AttendanceDay["status"], string> = {
  completed: "bg-accent",
  missed: "bg-[#02010a]",
  rest: "bg-[#ffffff] border border-border",
  future: "border border-dashed border-border/70",
};

const WEEKDAY_TO_COLUMN: Record<string, number> = { MON: 0, TUE: 1, WED: 2, THU: 3, FRI: 4, SAT: 5, SUN: 6 };

/** Lays `days` out into full Mon–Sun rows, padding the first row's leading edge
 * (dates before the tracked range) and the last row's trailing edge (future
 * dates within the current week) so every row is a symmetric 7-cell week. */
function toWeekRows(days: AttendanceDay[]): (AttendanceDay | null)[][] {
  if (days.length === 0) return [];
  const leading = WEEKDAY_TO_COLUMN[weekdayOf(days[0].date)];
  const cells: (AttendanceDay | null)[] = [...Array(leading).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push({ date: "", status: "future" });

  const rows: (AttendanceDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

export function AttendanceHeatmap({ days, label, accentColor }: { days: AttendanceDay[]; label: string; accentColor: string }) {
  const rows = toWeekRows(days);

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accentColor }} />
        <p className="text-sm font-medium">{label}</p>
      </div>

      <div className="inline-grid gap-1" style={{ gridTemplateColumns: "repeat(7, 1.5rem)" }}>
        {WEEKDAY_HEADERS.map((h, i) => (
          <div key={i} className="text-center text-[10px] font-medium text-text-faint">
            {h}
          </div>
        ))}

        {rows.map((row, ri) =>
          row.map((day, di) =>
            day ? (
              <div
                key={`${ri}-${di}`}
                title={day.date ? `${formatFriendly(day.date)} — ${day.status}` : undefined}
                className={cn("aspect-square w-6 rounded-md", STATUS_CLASSES[day.status])}
              />
            ) : (
              <div key={`${ri}-${di}`} className="aspect-square w-6" />
            )
          )
        )}
      </div>
    </div>
  );
}
