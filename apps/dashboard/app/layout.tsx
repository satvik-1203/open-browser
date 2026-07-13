import type { Metadata } from "next";
import "@repo/ui/globals.css";

import { QueryProvider } from "@/components/query-provider";

export const metadata: Metadata = {
  title: "Dashboard",
  description: "Dashboard for open-browser",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-svh bg-background text-foreground antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
