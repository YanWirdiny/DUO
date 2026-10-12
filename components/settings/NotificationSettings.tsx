"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { TIME_PATTERN, type NotificationPreferencesDto } from "@/lib/notification-rules";
import {
  browserPushEnv,
  currentSubscription,
  disablePush,
  enablePush,
  pushSupport,
  type PushEnv,
  type PushSupport,
} from "@/lib/push-client";

const SUPPORT_HINT: Record<PushSupport, string> = {
  unsupported: "This browser can't receive notifications. On iPhone, add Duo to your Home Screen and open it from there.",
  denied: "Notifications are blocked for Duo. Allow them in your browser settings, then try again.",
  default: "Get reminders on this device.",
  granted: "Get reminders on this device.",
};

/**
 * Notification settings: turn push on/off for this device, and choose which
 * reminders to get (gym day, log reminder) and at what local time. Device state
 * lives in the browser; reminder choices are saved per account.
 */
export function NotificationSettings({
  vapidPublicKey,
  preferences: initialPreferences,
  timezone,
  env: envOverride,
}: {
  /** null when the server has no VAPID keys: the device switch is disabled. */
  vapidPublicKey: string | null;
  preferences: NotificationPreferencesDto;
  timezone: string;
  /** Test seam; defaults to the real browser APIs. */
  env?: PushEnv;
}) {
  const [env, setEnv] = useState<PushEnv | null>(envOverride ?? null);
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [deviceOn, setDeviceOn] = useState(false);
  const [prefs, setPrefs] = useState(initialPreferences);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Browser APIs only exist after hydration, so device state is detected here.
  useEffect(() => {
    let cancelled = false;
    const pushEnv = envOverride ?? browserPushEnv();
    const state = pushSupport(pushEnv);
    const subscription = state === "unsupported" ? Promise.resolve(null) : currentSubscription(pushEnv);
    subscription
      .catch(() => null)
      .then((sub) => {
        if (cancelled) return;
        setEnv(pushEnv);
        setSupport(state);
        setDeviceOn(!!sub);
      });
    return () => {
      cancelled = true;
    };
  }, [envOverride]);

  // Only reachable through the device switch, which stays disabled until both
  // `env` (detected) and `vapidPublicKey` (server configured) exist.
  async function toggleDevice(on: boolean) {
    setBusy(true);
    setError(null);
    const result = on ? await enablePush(env!, vapidPublicKey!) : await disablePush(env!);
    if (result.ok) setDeviceOn(on);
    else setError(result.error);
    setSupport(pushSupport(env!));
    setBusy(false);
  }

  /** Saves a preference change; reverts the field if the server rejects it. */
  async function savePrefs(patch: Partial<NotificationPreferencesDto>) {
    const previous = prefs;
    setPrefs({ ...prefs, ...patch });
    setError(null);
    const res = await fetch("/api/notifications/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.preferences) {
      setPrefs(previous);
      setError(data.error ?? "Couldn't save your notification settings.");
      return;
    }
    setPrefs(data.preferences);
  }

  const deviceDisabled = busy || !vapidPublicKey || support === null || support === "unsupported";
  const hint = !vapidPublicKey ? "Notifications aren't set up on the server yet." : SUPPORT_HINT[support ?? "default"];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">This device</p>
            <p className="text-xs text-text-faint">{deviceOn ? "Notifications are on here." : hint}</p>
          </div>
          <Switch checked={deviceOn} onChange={toggleDevice} disabled={deviceDisabled} label="Notifications on this device" />
        </div>

        <ReminderRow
          key={`gym-${prefs.gymDayTime}`}
          title="Gym day"
          description="A morning nudge on your scheduled gym days."
          enabled={prefs.gymDayEnabled}
          time={prefs.gymDayTime}
          onEnabledChange={(gymDayEnabled) => savePrefs({ gymDayEnabled })}
          onTimeChange={(gymDayTime) => savePrefs({ gymDayTime })}
        />
        <ReminderRow
          key={`log-${prefs.logReminderTime}`}
          title="Log reminder"
          description="If a gym day isn't logged yet, a reminder before it's scored as missed."
          enabled={prefs.logReminderEnabled}
          time={prefs.logReminderTime}
          onEnabledChange={(logReminderEnabled) => savePrefs({ logReminderEnabled })}
          onTimeChange={(logReminderTime) => savePrefs({ logReminderTime })}
        />

        <p className="text-xs text-text-faint">
          Reminders only go out on gym days you haven&apos;t logged yet. Times are in your timezone ({timezone}).
        </p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </Card>
  );
}

function ReminderRow({
  title,
  description,
  enabled,
  time,
  onEnabledChange,
  onTimeChange,
}: {
  title: string;
  description: string;
  enabled: boolean;
  time: string;
  onEnabledChange: (enabled: boolean) => void;
  onTimeChange: (time: string) => void;
}) {
  // The parent keys this row by `time`, so a saved or reverted time remounts it with a fresh draft.
  const [draft, setDraft] = useState(time);

  return (
    <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-text-faint">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Input
          type="time"
          aria-label={`${title} time`}
          value={draft}
          disabled={!enabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== time && TIME_PATTERN.test(draft)) onTimeChange(draft);
            else setDraft(time);
          }}
          className="h-9 w-28 px-3"
        />
        <Switch checked={enabled} onChange={onEnabledChange} label={`Enable ${title.toLowerCase()}`} />
      </div>
    </div>
  );
}
