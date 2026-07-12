import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

/**
 * Public layout for the auth forms. If the visitor is already signed in, send
 * them to the dashboard instead of showing sign-in / sign-up.
 */
export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (session) {
    redirect("/");
  }

  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      {children}
    </div>
  );
}
