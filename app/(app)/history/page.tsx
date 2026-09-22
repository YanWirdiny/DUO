import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBuddyId } from "@/lib/buddy";
import { buildAttendance } from "@/lib/attendance";
import { formatFriendly, utcMidnightToDateStr } from "@/lib/dates";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { AttendanceHeatmap } from "@/components/history/AttendanceHeatmap";
import { ChevronRight } from "lucide-react";

const HEATMAP_DAYS = 56;

/** Attendance heatmaps (self + buddy) and a list of recently logged sessions. */
export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const buddyId = await getBuddyId(user.id);
  const buddy = buddyId ? await prisma.user.findUnique({ where: { id: buddyId } }) : null;

  const [myAttendance, buddyAttendance, recentLogs] = await Promise.all([
    buildAttendance(user.id, user.timezone, HEATMAP_DAYS),
    buddy ? buildAttendance(buddy.id, buddy.timezone, HEATMAP_DAYS) : Promise.resolve(null),
    prisma.workoutLog.findMany({
      where: { userId: user.id, completed: true },
      orderBy: { date: "desc" },
      take: 15,
      include: { setLogs: true, scheduleDay: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-text-muted">Last {HEATMAP_DAYS} days of attendance.</p>
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <AttendanceHeatmap days={myAttendance} label={user.displayName} accentColor={user.avatarColor} />
          {buddyAttendance && (
            <AttendanceHeatmap days={buddyAttendance} label={buddy!.displayName} accentColor={buddy!.avatarColor} />
          )}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-4 text-xs text-text-muted">
          <LegendDot className="bg-accent" label="Logged" />
          <LegendDot className="bg-[#02010a]" label="Missed" />
          <LegendDot className="bg-[#ffffff] border border-border" label="Rest day" />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent sessions</CardTitle>
        </CardHeader>
        {recentLogs.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-faint">No sessions logged yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {recentLogs.map((log) => (
              <li key={log.id}>
                <Link
                  href={`/log/${utcMidnightToDateStr(log.date)}`}
                  className="flex items-center justify-between gap-3 py-3 text-sm hover:text-accent"
                >
                  <div>
                    <p className="font-medium">{log.scheduleDay?.label || "Workout"}</p>
                    <p className="text-xs text-text-faint">{formatFriendly(utcMidnightToDateStr(log.date))}</p>
                  </div>
                  <div className="flex items-center gap-2 text-text-faint">
                    <span className="text-xs">{log.setLogs.length} sets</span>
                    <ChevronRight size={14} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Small colored dot + label used in the heatmap legend. */
function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  );
}
