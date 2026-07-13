"use client";

import { Button } from "@repo/ui/components/button";
import { AlertTriangle, Loader2, MonitorPlay, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BrowserLiveView } from "./browser-live-view";
import { formatDateTime } from "./format";
import { PanelHeader } from "./panel-header";
import { SessionStatusBadge } from "./status-badge";
import { pageWebSocketUrl } from "@/lib/dashboard/cdp";
import {
  useBrowserLive,
  useBrowsersQuery,
  useStartBrowser,
} from "@/lib/dashboard/queries";
import type { BrowserSessionRecord } from "@/lib/dashboard/types";

const ACTIVE = new Set(["starting", "running", "stopping"]);

// A new browser is always launched with these fixed options — a standard
// 1080p 16:9 viewport so pages render in their desktop layout.
const DEFAULT_START = {
  url: "https://google.com",
  headless: true,
  record: true,
  viewport: { width: 1920, height: 1080 },
} as const;

export function BrowsersList() {
  const router = useRouter();
  const browsers = useBrowsersQuery();
  const startMut = useStartBrowser();

  const live = browsers.data
    ? browsers.data.sessions.filter((s) => ACTIVE.has(s.status))
    : null;

  async function start() {
    try {
      const { id } = await startMut.mutateAsync(DEFAULT_START);
      router.push(`/browsers/${id}`);
    } catch {
      // Surfaced via startMut.error below.
    }
  }

  const errorMessage =
    startMut.error instanceof Error
      ? startMut.error.message
      : browsers.error instanceof Error
        ? browsers.error.message
        : null;

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8">
      <PanelHeader
        title="Browsers"
        subtitle="Live browser sessions. Click a card to open and control it."
        actions={
          <Button size="sm" onClick={start} disabled={startMut.isPending}>
            {startMut.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Start browser
          </Button>
        }
      />

      {errorMessage && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive mb-4 flex items-center gap-2 rounded border px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {live === null ? (
        <LoadingGrid />
      ) : live.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {live.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionCard({ session }: { session: BrowserSessionRecord }) {
  const isRunning = session.status === "running";
  const isActive = ACTIVE.has(session.status);

  const live = useBrowserLive(session.id, isRunning);
  const wsUrl = live.data ? pageWebSocketUrl(live.data) : null;

  return (
    <div className="group bg-card relative overflow-hidden rounded border transition-colors hover:border-primary/40">
      <Link href={`/browsers/${session.id}`} className="block">
        <div className="bg-muted aspect-video w-full">
          {isRunning && wsUrl ? (
            <BrowserLiveView wsUrl={wsUrl} className="h-full w-full" />
          ) : (
            <div className="text-muted-foreground flex h-full w-full flex-col items-center justify-center gap-2 text-xs">
              <MonitorPlay className="size-6 opacity-40" />
              {isActive ? "Preparing live view…" : "Session ended"}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t px-3 py-2">
          <div className="flex min-w-0 flex-col">
            <code className="text-muted-foreground truncate font-mono text-[11px]">
              {session.id}
            </code>
            <span className="text-muted-foreground text-[11px]">
              {formatDateTime(session.createdAt)}
            </span>
          </div>
          <SessionStatusBadge status={session.status} />
        </div>
      </Link>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-card overflow-hidden rounded border">
          <div className="bg-muted aspect-video w-full animate-pulse" />
          <div className="flex items-center justify-between border-t px-3 py-2">
            <div className="bg-muted h-6 w-32 animate-pulse rounded" />
            <div className="bg-muted h-5 w-16 animate-pulse rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-3 rounded border border-dashed py-20 text-center">
      <MonitorPlay className="size-7 opacity-50" />
      <div>
        <p className="text-sm">No live browsers.</p>
        <p className="text-xs">
          Use “Start browser” to launch a live, controllable session.
        </p>
      </div>
    </div>
  );
}
