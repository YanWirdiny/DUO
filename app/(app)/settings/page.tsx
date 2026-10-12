import { getCurrentUser } from "@/lib/auth";
import { getNotificationPreferences } from "@/lib/notifications";
import { preferencesToDto } from "@/lib/notification-rules";
import { getVapidConfig } from "@/lib/push";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { NotificationSettings } from "@/components/settings/NotificationSettings";
import { PasswordForm } from "@/components/settings/PasswordForm";

/** Account settings: profile fields, notifications, and password change. */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  const preferences = await getNotificationPreferences(user.id);
  // Only the public half of the VAPID pair is sent to the browser. It's read at
  // request time (not NEXT_PUBLIC_*), so rotating keys doesn't need a rebuild.
  const vapidPublicKey = getVapidConfig()?.publicKey ?? null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      <ProfileForm displayName={user.displayName} timezone={user.timezone} avatarColor={user.avatarColor} />
      <NotificationSettings
        vapidPublicKey={vapidPublicKey}
        preferences={preferencesToDto(preferences)}
        timezone={user.timezone}
      />
      <PasswordForm />
    </div>
  );
}
