import { getCurrentUser } from "@/lib/auth";
import { ProfileForm } from "@/components/settings/ProfileForm";
import { PasswordForm } from "@/components/settings/PasswordForm";

/** Account settings: profile fields and password change. */
export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) return null;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      <ProfileForm displayName={user.displayName} timezone={user.timezone} avatarColor={user.avatarColor} />
      <PasswordForm />
    </div>
  );
}
