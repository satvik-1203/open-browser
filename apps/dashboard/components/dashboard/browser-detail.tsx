"use client";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";
import { AlertTriangle, ArrowLeft, Loader2, Plug, Power } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BrowserLiveView } from "./browser-live-view";
import { CopyButton } from "./copy-button";
import { formatDateTime } from "./format";
import { SessionStatusBadge } from "./status-badge";
import { pageWebSocketUrl } from "@/lib/dashboard/cdp";
import {
  useBrowserLive,
  useSessionRecord,
  useStopBrowser,
} from "@/lib/dashboard/queries";

const ACTIVE = new Set(["starting", "running", "stopping"]);

export function BrowserDetail({ id }: { id: string }) {
  const router = useRouter();
  const record = useSessionRecord(id);
  const rec = record.data;
  const notFound = rec === null;
  const isActive = rec ? ACTIVE.has(rec.status) : false;

  const live = useBrowserLive(id, isActive);
  const info = live.data ?? null;
  const wsUrl = info ? pageWebSocketUrl(info) : null;

  const stopMut = useStopBrowser();

  async function stop() {
    try {
      await stopMut.mutateAsync(id);
      // Go straight to the recording — it may still be encoding/uploading.
      router.push(`/recordings/${id}`);
    } catch {
      // Reflected on the next status poll.
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-5xl p-6 md:p-8">
        <BackLink />
        <div className="text-muted-foreground mt-6 rounded border border-dashed py-16 text-center text-sm">
          This browser session doesn&apos;t exist or isn&apos;t yours.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8">
      <BackLink />

      <div className="mt-4 mb-4 flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Browser</h1>
            {rec && <SessionStatusBadge status={rec.status} />}
          </div>
          <code className="text-muted-foreground font-mono text-xs">{id}</code>
          {rec && (
            <span className="text-muted-foreground text-xs">
              Started {formatDateTime(rec.startedAt ?? rec.createdAt)}
            </span>
          )}
        </div>
        {isActive && (
          <Button
            variant="outline"
            className="text-muted-foreground hover:text-destructive"
            disabled={stopMut.isPending || rec?.status === "stopping"}
            onClick={stop}
          >
            {stopMut.isPending ? <Loader2 className="animate-spin" /> : <Power />}
            Stop
          </Button>
        )}
      </div>

      {isActive && wsUrl ? (
        <div className="w-full overflow-hidden rounded border">
          <BrowserLiveView wsUrl={wsUrl} interactive className="w-full" />
        </div>
      ) : (
        <div className="bg-muted text-muted-foreground flex aspect-video w-full items-center justify-center overflow-hidden rounded border text-sm">
          {isActive ? "Connecting to live view…" : "Session has ended."}
        </div>
      )}
      {isActive && wsUrl && (
        <p className="text-muted-foreground mt-2 text-center text-xs">
          Click, scroll, and type to control the browser · recording continues in
          the background
        </p>
      )}

      {info && (
        <div className="bg-card mt-6 flex flex-col gap-3 rounded border p-4">
          <div className="flex items-center gap-2 text-sm">
            <Plug className="text-muted-foreground size-4" />
            <span className="text-muted-foreground">CDP client:</span>
            <span
              className={cn(
                "font-medium",
                info.connected ? "text-primary" : "text-muted-foreground",
              )}
            >
              {info.connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <CdpField
            label="WebSocket debugger URL"
            value={info.webSocketDebuggerUrl}
          />
          <CdpField label="DevTools URL" value={info.debuggerUrl} openable />
          <p className="text-muted-foreground text-xs">
            Connect any CDP client (Playwright, Puppeteer) to the WebSocket URL —
            no token required.
          </p>
        </div>
      )}

      {rec?.errorMessage && (
        <p className="text-destructive mt-4 flex items-center gap-1.5 text-sm">
          <AlertTriangle className="size-4" />
          {rec.errorMessage}
        </p>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/"
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
    >
      <ArrowLeft className="size-4" />
      Browsers
    </Link>
  );
}

function CdpField({
  label,
  value,
  openable = false,
}: {
  label: string;
  value: string;
  openable?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-center gap-2">
        <code className="bg-background flex-1 truncate rounded border px-3 py-1.5 font-mono text-xs">
          {value}
        </code>
        {openable && (
          <Button variant="outline" size="sm" asChild>
            <a href={value} target="_blank" rel="noreferrer">
              Open
            </a>
          </Button>
        )}
        <CopyButton value={value} />
      </div>
    </div>
  );
}
