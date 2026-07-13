"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import type { RecordingStatus } from "@repo/types";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Play,
  Search,
  Video,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type * as React from "react";

import { formatDateTime } from "./format";
import { PanelHeader } from "./panel-header";
import { RecordingStatusBadge } from "./status-badge";
import { dashboardApi } from "@/lib/dashboard/api";
import { downloadFile } from "@/lib/dashboard/download";
import {
  useRecordedSessionsPage,
  useSessionSearch,
} from "@/lib/dashboard/queries";
import type { BrowserSessionRecord } from "@/lib/dashboard/types";

const PAGE_SIZES = [10, 25, 50, 100];
const STORAGE_KEY = "ob:recordings-page-size";

export function RecordingsTable() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Cursor stack for prev/next navigation over the keyset-paginated API.
  const [pageCursors, setPageCursors] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const cursor = pageCursors[pageIndex] ?? null;

  // Restore the persisted page size after mount (avoids hydration mismatch).
  useEffect(() => {
    const stored = Number(localStorage.getItem(STORAGE_KEY));
    if (PAGE_SIZES.includes(stored)) setPageSize(stored);
  }, []);

  function changePageSize(n: number) {
    setPageSize(n);
    localStorage.setItem(STORAGE_KEY, String(n));
    // Page size changes invalidate the cursor stack — restart from the top.
    setPageCursors([null]);
    setPageIndex(0);
  }

  const searching = query.trim().length > 0;
  const page = useRecordedSessionsPage(pageSize, cursor);
  const search = useSessionSearch(query);

  const sessions: BrowserSessionRecord[] = searching
    ? search.data
      ? [search.data]
      : []
    : (page.data?.sessions ?? []);

  const loading = searching ? search.isLoading : page.isLoading;
  const hasPrev = pageIndex > 0;
  const hasNext = !!page.data?.nextCursor;
  const total = page.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function goNext() {
    const next = page.data?.nextCursor;
    if (!next) return;
    setPageCursors((prev) =>
      prev.length > pageIndex + 1 ? prev : [...prev, next],
    );
    setPageIndex((i) => i + 1);
  }

  function goPrev() {
    setPageIndex((i) => Math.max(0, i - 1));
  }

  async function download(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setDownloading(id);
    setDownloadError(null);
    try {
      const { url } = await dashboardApi.getRecordingUrl(id);
      await downloadFile(url, `recording-${id}.mp4`);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "failed to download");
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8">
      <PanelHeader
        title="Recordings"
        subtitle="Session replays, most recent first."
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            placeholder="Search by exact session id…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
          {searching && search.isFetching && (
            <Loader2 className="text-muted-foreground absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin" />
          )}
        </div>

        {!searching && (
          <div className="flex shrink-0 items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) => changePageSize(Number(v))}
            >
              <SelectTrigger size="sm" className="w-[128px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Previous page"
              disabled={!hasPrev || page.isFetching}
              onClick={goPrev}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Next page"
              disabled={!hasNext || page.isFetching}
              onClick={goNext}
            >
              <ChevronRight />
            </Button>
          </div>
        )}
      </div>

      {downloadError && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive mb-4 flex items-center gap-2 rounded border px-3 py-2 text-sm">
          <AlertTriangle className="size-4 shrink-0" />
          {downloadError}
        </div>
      )}

      {loading ? (
        <LoadingRows />
      ) : sessions.length === 0 ? (
        <EmptyState hasQuery={searching} />
      ) : (
        <>
          <div className="overflow-hidden rounded border">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th className="px-4 py-2 font-medium">Session ID</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => {
                  const status = session.recordingStatus as RecordingStatus;
                  const ready = status === "completed";
                  return (
                    <tr
                      key={session.id}
                      onClick={() =>
                        ready && router.push(`/recordings/${session.id}`)
                      }
                      className={rowClass(ready)}
                    >
                      <td className="px-4 py-2.5">
                        <code className="font-mono text-xs">{session.id}</code>
                      </td>
                      <td className="text-muted-foreground px-4 py-2.5 text-xs whitespace-nowrap">
                        {formatDateTime(session.startedAt ?? session.createdAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <RecordingStatusBadge status={status} />
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!ready}
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(`/recordings/${session.id}`);
                            }}
                          >
                            <Play />
                            Watch
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!ready || downloading === session.id}
                            onClick={(e) => download(session.id, e)}
                          >
                            {downloading === session.id ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <Download />
                            )}
                            Download
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!searching && (
            <div className="text-muted-foreground mt-3 text-center text-xs tabular-nums">
              Page {pageIndex + 1} of {totalPages} · {total} recording
              {total === 1 ? "" : "s"}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function rowClass(clickable: boolean): string {
  return [
    "bg-card border-b transition-colors last:border-b-0",
    clickable ? "cursor-pointer hover:bg-accent/50" : "",
  ].join(" ");
}

function LoadingRows() {
  return (
    <div className="overflow-hidden rounded border">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-card flex items-center gap-4 border-b px-4 py-3 last:border-b-0"
        >
          <div className="bg-muted h-4 w-64 animate-pulse rounded" />
          <div className="bg-muted h-4 w-24 animate-pulse rounded" />
          <div className="ml-auto bg-muted h-8 w-40 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 rounded border border-dashed py-16 text-center">
      <Video className="size-6 opacity-50" />
      <p className="text-sm">
        {hasQuery ? "No recording with that id." : "No recordings yet."}
      </p>
      {!hasQuery && (
        <p className="text-xs">
          Every browser is started with recording on — one will appear here after
          it ends.
        </p>
      )}
    </div>
  );
}
