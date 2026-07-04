import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Browser Debug",
  description: "Test pages for the browser server API",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Browser Debug</Link>
          <Link href="/start">Start</Link>
          <Link href="/connect">Connect</Link>
          <Link href="/stop">Stop</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
