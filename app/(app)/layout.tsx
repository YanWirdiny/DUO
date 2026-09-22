import { requireUser } from "@/lib/page-auth";
import { AppShell } from "@/components/nav/AppShell";

/** Shared layout for authenticated routes; redirects to /login if there's no session. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  return (
    <AppShell user={{ displayName: user.displayName, avatarColor: user.avatarColor }}>
      {children}
    </AppShell>
  );
}
