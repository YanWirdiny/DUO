"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { cn } from "@/lib/utils";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Lagos",
  "Africa/Cairo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const AVATAR_COLORS = ["#6D4DFC", "#FF7A45", "#1FB27A", "#EF4D6B", "#3B82F6", "#F59E0B", "#EC4899", "#14B8A6"];

export function ProfileForm({
  displayName: initialName,
  timezone: initialTimezone,
  avatarColor: initialColor,
}: {
  displayName: string;
  timezone: string;
  avatarColor: string;
}) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [avatarColor, setAvatarColor] = useState(initialColor);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: Partial<{ displayName: string; timezone: string; avatarColor: string }>) {
    setBusy(true);
    setSaved(false);
    setError(null);
    const res = await fetch("/api/settings/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save your profile.");
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>

      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="displayName">Display name</Label>
          <div className="flex gap-2">
            <Input
              id="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              onBlur={() => displayName !== initialName && save({ displayName })}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="timezone">Timezone</Label>
          <select
            id="timezone"
            value={timezone}
            onChange={(e) => {
              setTimezone(e.target.value);
              save({ timezone: e.target.value });
            }}
            className="h-11 w-full rounded-xl border border-border bg-surface-raised px-4 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            {[...new Set([timezone, ...COMMON_TIMEZONES])].map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-text-faint">Used to determine your gym day and streaks.</p>
        </div>

        <div>
          <Label>Avatar color</Label>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => {
                  setAvatarColor(color);
                  save({ avatarColor: color });
                }}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full ring-offset-2 ring-offset-surface transition-shadow",
                  avatarColor === color && "ring-2 ring-accent"
                )}
                style={{ backgroundColor: color }}
              >
                {avatarColor === color && <Check size={14} className="text-white" />}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-danger">{error}</p>}
        {saved && !busy && !error && (
          <p className="text-xs text-success">Saved</p>
        )}
      </div>
    </Card>
  );
}
