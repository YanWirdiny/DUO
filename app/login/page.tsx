import { LoginForm } from "@/components/auth/LoginForm";
import { Card } from "@/components/ui/Card";

/** Public sign-in screen with a desktop hero image and the login form. */
export default function LoginPage() {
  return (
    <div className="flex min-h-dvh">
      {/* Photo hero — desktop only */}
      <div className="relative hidden w-1/2 shrink-0 overflow-hidden bg-[#02010a] md:block">
        {/* eslint-disable-next-line @next/next/no-img-element -- full-bleed hero, next/image adds no value here */}
        <img src="/images/arm-exercise-mono.jpg" alt="" className="h-full w-full object-cover opacity-85" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#02010a] via-[#02010a]/20 to-transparent" />
        <div className="absolute left-10 top-10 h-1 w-12 rounded-full bg-accent" />
        <div className="absolute inset-x-0 bottom-0 p-10">
          <p className="text-3xl font-semibold leading-tight tracking-tight text-white">
            Show up.
            <br />
            Every time.
          </p>
          <p className="mt-3 max-w-xs text-sm text-white/70">
            Track your sessions, keep your streak, and hold each other accountable.
          </p>
        </div>
      </div>

      {/* Form */}
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static local icon, not worth next/image's overhead */}
            <img
              src="/icons/logoGym.png"
              alt="Duo"
              className="h-14 w-14 rounded-3xl object-cover shadow-[var(--shadow-raised)]"
            />
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
              <p className="text-sm text-text-muted">Sign in to log today&apos;s session.</p>
            </div>
          </div>

          <Card className="p-6">
            <LoginForm />
          </Card>
        </div>
      </div>
    </div>
  );
}
