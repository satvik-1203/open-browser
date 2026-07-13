import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/dashboard/app-shell";
import { SignOutButton } from "@/components/sign-out-button";
import { auth } from "@/lib/auth";

/**
 * Gated layout: every page rendered under this route group requires a session.
 * Unauthenticated requests are redirected to /sign-in. Provides the persistent
 * app chrome — top bar + collapsible sidebar — around the routed page.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <div className="flex h-svh flex-col">
      <header className="flex shrink-0 items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold tracking-tight">
          open-browser
        </span>
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">
            {session.user.username ?? session.user.name}
          </span>
          <SignOutButton />
        </div>
      </header>
      <AppShell>{children}</AppShell>
    </div>
  );
}
