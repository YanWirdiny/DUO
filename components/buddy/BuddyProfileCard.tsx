"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Flame as FlameIcon } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/** Buddy summary card with a confirm-before-disconnect action. */
export function BuddyProfileCard({
  buddy,
}: {
  buddy: { displayName: string; avatarColor: string; gymScore: number; currentStreak: number; longestStreak: number };
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Unpairs from the current buddy and refreshes server data. */
  async function disconnect() {
    setBusy(true);
    await fetch("/api/buddy/disconnect", { method: "POST" });
    router.refresh();
  }

  return (
    <Card>
      <div className="flex items-center gap-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold text-white"
          style={{ backgroundColor: buddy.avatarColor }}
        >
          {buddy.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <p className="text-lg font-semibold">{buddy.displayName}</p>
          <div className="mt-1 flex items-center gap-4 text-sm text-text-muted">
            <span className="flex items-center gap-1">
              <Trophy size={14} /> {buddy.gymScore} pts
            </span>
            <span className="flex items-center gap-1">
              <FlameIcon size={14} /> {buddy.currentStreak} streak
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5 border-t border-border pt-4">
        {confirming ? (
          <div className="flex items-center gap-2">
            <p className="flex-1 text-sm text-text-muted">Disconnect from {buddy.displayName}?</p>
            <Button variant="secondary" size="sm" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={disconnect} disabled={busy}>
              Disconnect
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setConfirming(true)}>
            Disconnect buddy
          </Button>
        )}
      </div>
    </Card>
  );
}
