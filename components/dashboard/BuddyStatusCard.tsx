import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StreakFlame } from "@/components/ui/StreakFlame";
import { Trophy, UserPlus } from "lucide-react";

/** Shows the connected buddy's status today, or a prompt to connect if `buddy` is null. */
export function BuddyStatusCard({
  buddy,
}: {
  buddy: {
    displayName: string;
    avatarColor: string;
    gymScore: number;
    currentStreak: number;
    isGymDayToday: boolean;
    loggedToday: boolean;
  } | null;
}) {
  if (!buddy) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Buddy</CardTitle>
        </CardHeader>
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <UserPlus className="text-text-faint" size={24} />
          <p className="text-sm text-text-muted">
            You&apos;re not connected with a gym buddy yet.
          </p>
          <Link href="/info" className="text-sm font-medium text-accent hover:underline">
            Connect now
          </Link>
        </div>
      </Card>
    );
  }

  const statusTone = !buddy.isGymDayToday ? "neutral" : buddy.loggedToday ? "success" : "danger";
  const statusLabel = !buddy.isGymDayToday ? "Rest day" : buddy.loggedToday ? "Logged today" : "Not logged yet";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Buddy</CardTitle>
        <Badge tone={statusTone}>{statusLabel}</Badge>
      </CardHeader>

      <div className="flex items-center gap-3">
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full text-base font-semibold text-white"
          style={{ backgroundColor: buddy.avatarColor }}
        >
          {buddy.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="flex-1">
          <p className="font-medium">{buddy.displayName}</p>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-text-muted">
            <span className="flex items-center gap-1">
              <Trophy size={12} /> {buddy.gymScore}
            </span>
            <span className="flex items-center gap-1">
              <StreakFlame active={buddy.currentStreak > 0} className="h-3.5 w-3.5" /> {buddy.currentStreak}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
