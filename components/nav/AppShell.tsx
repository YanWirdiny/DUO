"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Dumbbell, Home, CalendarDays, Info as InfoIcon, Settings, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { SplashScreen } from "./SplashScreen";

const NAV_ITEMS = [
  { href: "/", label: "Today", icon: Home },
  { href: "/program", label: "Program", icon: Dumbbell },
  { href: "/history", label: "History", icon: CalendarDays },
  { href: "/info", label: "Info", icon: InfoIcon },
];

/** App layout chrome: desktop sidebar nav + mobile top bar/bottom nav, wrapping page content. */
export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { displayName: string; avatarColor: string };
}) {
  const pathname = usePathname();
  const router = useRouter();
  // Home carries its own title + avatar header and sits on the warm canvas from the Figma redesign.
  const isHome = pathname === "/";

  /** Clears the session cookie, then hard-redirects to /login and refreshes server state. */
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className={cn("min-h-dvh md:flex", isHome && "bg-canvas")}>
      <SplashScreen />

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface px-5 py-6 md:flex">
        <div className="mb-8 flex items-center gap-2 px-1">
          {/* eslint-disable-next-line @next/next/no-img-element -- small static local icon, not worth next/image's overhead */}
          <img src="/icons/logoGym.png" alt="" className="h-9 w-9 rounded-2xl object-cover" />
          <span className="text-lg font-semibold tracking-tight">Duo</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active ? "bg-accent-soft text-accent-strong" : "text-text-muted hover:bg-surface-raised hover:text-text"
                )}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex items-center gap-3 border-t border-border pt-4">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: user.avatarColor }}
          >
            {user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
          </div>
          <Link
            href="/settings"
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-surface-raised hover:text-text"
          >
            <Settings size={16} />
          </Link>
          <button
            onClick={handleLogout}
            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col">
        <header className={cn("flex items-center justify-between border-b border-border bg-surface px-5 py-4 md:hidden", isHome && "hidden")}>
          <div className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static local icon, not worth next/image's overhead */}
            <img src="/icons/logoGym.png" alt="" className="h-8 w-8 rounded-xl object-cover" />
            <span className="font-semibold tracking-tight">Duo</span>
          </div>
          <Link
            href="/settings"
            className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: user.avatarColor }}
          >
            {user.displayName.slice(0, 1).toUpperCase()}
          </Link>
        </header>

        <main className="flex-1 px-4 pb-32 pt-5 md:px-8 md:pb-10 md:pt-8">
          <div className="mx-auto w-full max-w-3xl">{children}</div>
        </main>

        {/* Mobile bottom nav: floating pill of round icon buttons (Figma tab bar). */}
        <nav className="fixed inset-x-5 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-20 flex h-[68px] items-center justify-between rounded-[34px] bg-chip px-6 shadow-[var(--shadow-raised)] md:hidden">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex size-11 items-center justify-center rounded-full bg-chip text-ink transition-colors",
                  active ? "border-[1.5px] border-ink" : "border border-hairline"
                )}
              >
                <Icon size={20} strokeWidth={1.75} />
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
