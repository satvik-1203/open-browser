import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Open Browser — Thousands of browsers, one command",
  description:
    "Open-source browser infrastructure. Spin up sandboxed, headless Chromium at scale for AI agents and automation. Self-host anywhere and connect over CDP in seconds.",
  applicationName: "Open Browser",
  keywords: [
    "browser infrastructure",
    "headless chromium",
    "CDP",
    "puppeteer",
    "playwright",
    "web automation",
    "AI agents",
    "open source",
  ],
  openGraph: {
    title: "Open Browser — Thousands of browsers, one command",
    description:
      "Spin up sandboxed, headless Chromium at scale for AI agents and automation. Self-host anywhere, connect over CDP in seconds.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
