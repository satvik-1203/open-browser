"use client";

import { Button } from "@repo/ui/components/button";
import type { RecordingStatus } from "@repo/types";
import { AlertTriangle, ArrowLeft, Download, Loader2, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { dashboardApi } from "@/lib/dashboard/api";
import { downloadFile } from "@/lib/dashboard/download";
import { useRecordingUrl, useSessionRecord } from "@/lib/dashboard/queries";
import { RecordingActivity } from "@/components/dashboard/recording-activity";

// `undefined` = still loading the session; `null` = session/recording not found.
type Status = RecordingStatus | null | undefined;

export function RecordingPlayer({ id }: { id: string }) {
  // We drive our own inverse-backoff refetch loop below, so disable auto-poll.
  const record = useSessionRecord(id, { poll: false });
  const rec = record.data;
  const status: Status =
    rec === undefined ? undefined : (rec?.recordingStatus ?? null);

  const isCompleted = status === "completed";
  const preparing = status === "recording" || status === "processing";

  // Only once the recording is finalized do we resolve its (S3) URL.
  const urlQuery = useRecordingUrl(id, isCompleted);
  const url = urlQuery.data?.url ?? null;

  const [downloading, setDownloading] = useState(false);

  // Poll the recording status with an inverse backoff while it's still being
  // produced: wait longer up front, then faster, floored at 2s.
  const { refetch } = record;
  useEffect(() => {
    if (!preparing) return;
    let cancelled = false;
    let delay = 5000;
    let timer: ReturnType<typeof setTimeout>;
    function loop() {
      timer = setTimeout(async () => {
        if (cancelled) return;
        const next = (await refetch()).data?.recordingStatus;
        if (cancelled) return;
        if (next === "recording" || next === "processing") {
          delay = Math.max(2000, Math.round(delay * 0.6));
          loop();
        }
      }, delay);
    }
    loop();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [preparing, refetch]);

  async function download() {
    setDownloading(true);
    try {
      const resolved = await dashboardApi.getRecordingUrl(id, {
        download: true,
      });
      downloadFile(resolved.url, `recording-${id}.mp4`);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8">
      <Link
        href="/recordings"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        Recordings
      </Link>

      <div className="mt-4 mb-4 flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold tracking-tight">Recording</h1>
          <code className="text-muted-foreground font-mono text-xs">{id}</code>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={!url || downloading}
          onClick={download}
        >
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
          Download
        </Button>
      </div>

      <Content status={status} url={url} />

      <RecordingActivity id={id} enabled={isCompleted} />
    </div>
  );
}

function Content({
  status,
  url,
}: {
  status: Status;
  url: string | null;
}) {
  if (url) {
    return (
      <div className="bg-card overflow-hidden rounded border">
        <video src={url} controls autoPlay className="aspect-video w-full bg-black" />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <Box variant="error">
        <AlertTriangle className="size-6" />
        <p className="text-sm">This recording failed to process.</p>
      </Box>
    );
  }

  if (status === null || status === "none") {
    return (
      <Box>
        <Video className="size-6 opacity-50" />
        <p className="text-sm">This session has no recording.</p>
      </Box>
    );
  }

  // Recording is finalized — we're fetching/loading it from storage (S3).
  if (status === "completed") {
    return (
      <Box>
        <Loader2 className="size-6 animate-spin opacity-70" />
        <p className="text-sm">Loading recording…</p>
      </Box>
    );
  }

  // Still being encoded/uploaded on the server (or the session is still loading).
  return (
    <Box>
      <Loader2 className="size-6 animate-spin opacity-70" />
      <div>
        <p className="text-sm">Preparing your video…</p>
        <p className="text-xs">It should be ready in a few seconds.</p>
      </div>
    </Box>
  );
}

function Box({
  children,
  variant = "muted",
}: {
  children: ReactNode;
  variant?: "muted" | "error";
}) {
  const tone =
    variant === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "bg-muted text-muted-foreground border-border";
  return (
    <div
      className={`flex aspect-video w-full flex-col items-center justify-center gap-2 rounded border text-center ${tone}`}
    >
      {children}
    </div>
  );
}
