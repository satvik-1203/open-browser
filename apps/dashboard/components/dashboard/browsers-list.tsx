"use client";

import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { AlertTriangle, Loader2, MonitorPlay, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrowserLiveView } from "./browser-live-view";
import { formatDateTime } from "./format";
import { PanelHeader } from "./panel-header";
import { SessionStatusBadge } from "./status-badge";
import { pageWebSocketUrl } from "@/lib/dashboard/cdp";
import {
  useBrowserLive,
  useBrowsersQuery,
  useContextsQuery,
  useStartBrowser,
} from "@/lib/dashboard/queries";
import type {
  BrowserContextRecord,
  BrowserSessionRecord,
} from "@/lib/dashboard/types";

const ACTIVE = new Set(["starting", "running", "stopping"]);

// A new browser is always launched with these fixed options — headful (less
// bot-detectable) with a standard 1080p 16:9 viewport so pages render in their
// desktop layout.
const DEFAULT_START = {
  url: "https://google.com",
  headless: false,
  record: true,
  viewport: { width: 1920, height: 1080 },
} as const;

/** Select's value for "no context" — Radix reserves the empty string. */
const NO_CONTEXT = "none";

/** How many contexts the picker lists before you have to search. */
const RECENT_CONTEXTS = 5;

/** Most recently used first — that's what the picker's top slots are for. */
function byRecency(a: BrowserContextRecord, b: BrowserContextRecord): number {
  return (
    Date.parse(b.lastUsedAt ?? b.createdAt) -
    Date.parse(a.lastUsedAt ?? a.createdAt)
  );
}

export function BrowsersList() {
  const router = useRouter();
  const browsers = useBrowsersQuery();
  const startMut = useStartBrowser();
  const contextsQuery = useContextsQuery();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [contextId, setContextId] = useState<string>(NO_CONTEXT);
  const [persist, setPersist] = useState(false);
  const [search, setSearch] = useState("");

  const contexts = [...(contextsQuery.data ?? [])].sort(byRecency);
  const query = search.trim().toLowerCase();
  // No query: just the most recent handful, so the list stays scannable.
  // Typing searches the whole set (name or id) rather than filtering those.
  const matches = query
    ? contexts.filter(
        (c) =>
          (c.name ?? "").toLowerCase().includes(query) ||
          c.id.toLowerCase().includes(query),
      )
    : contexts.slice(0, RECENT_CONTEXTS);
  // The selected context has to stay rendered even when the search excludes
  // it, or Radix has no item to match the current value against.
  const visible =
    contextId !== NO_CONTEXT && !matches.some((c) => c.id === contextId)
      ? [...matches, ...contexts.filter((c) => c.id === contextId)]
      : matches;
  const hiddenCount = query ? 0 : contexts.length - matches.length;

  const selected =
    contextId === NO_CONTEXT
      ? null
      : (contexts.find((c) => c.id === contextId) ?? null);
  // Several sessions may write to one context at once — each saves back only
  // what it changed, merged onto the current version — so writing is never
  // blocked. The count is shown as a heads-up, not a restriction.
  const otherWriters = selected?.writers ?? 0;

  const live = browsers.data
    ? browsers.data.sessions.filter((s) => ACTIVE.has(s.status))
    : null;

  function openDialog() {
    setContextId(NO_CONTEXT);
    setPersist(false);
    setSearch("");
    startMut.reset();
    setDialogOpen(true);
  }

  async function start() {
    try {
      const { id } = await startMut.mutateAsync({
        ...DEFAULT_START,
        ...(selected
          ? {
              contextId: selected.id,
              persistContext: persist,
            }
          : {}),
      });
      setDialogOpen(false);
      router.push(`/browsers/${id}`);
    } catch {
      // Surfaced via startMut.error in the dialog.
    }
  }

  // The start error belongs to the dialog; only list failures surface here.
  const errorMessage =
    browsers.error instanceof Error ? browsers.error.message : null;
  const startError =
    startMut.error instanceof Error ? startMut.error.message : null;

  return (
    <div className="mx-auto max-w-5xl p-6 md:p-8">
      <PanelHeader
        title="Browsers"
        subtitle="Live browser sessions. Click a card to open and control it."
        count={live?.length ?? 0}
        actions={
          <Button size="sm" onClick={openDialog} disabled={startMut.isPending}>
            {startMut.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Start browser
          </Button>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Start browser</DialogTitle>
            <DialogDescription>
              Launches a headful 1920×1080 session with recording on. Pick a
              context to start it signed in with that profile&apos;s cookies.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="start-context">Context</Label>
            <Select
              value={contextId}
              onValueChange={(value) => {
                setContextId(value);
                if (value === NO_CONTEXT) setPersist(false);
              }}
            >
              <SelectTrigger id="start-context" className="w-full">
                <SelectValue placeholder="No context" />
              </SelectTrigger>
              <SelectContent>
                <div className="p-1">
                  <Input
                    autoFocus
                    placeholder="Search contexts…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    // Radix Select's typeahead would otherwise swallow every
                    // keystroke and jump the highlight around while typing.
                    onKeyDown={(e) => e.stopPropagation()}
                    className="h-8"
                  />
                </div>
                <SelectItem value={NO_CONTEXT}>No context</SelectItem>
                {visible.map((context) => (
                  <SelectItem key={context.id} value={context.id}>
                    <span className="truncate">
                      {context.name ?? "Untitled context"}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      v{context.version}
                      {context.writers > 0 ? ` · ${context.writers} writing` : ""}
                    </span>
                  </SelectItem>
                ))}
                {visible.length === 0 && (
                  <p className="text-muted-foreground px-2 py-3 text-center text-xs">
                    No contexts match “{search.trim()}”.
                  </p>
                )}
                {hiddenCount > 0 && (
                  <p className="text-muted-foreground px-2 py-1.5 text-xs">
                    {hiddenCount} more — search to find them.
                  </p>
                )}
              </SelectContent>
            </Select>

            <label
              className={`mt-1 flex items-start gap-2 text-sm ${
                selected ? "" : "text-muted-foreground cursor-not-allowed"
              }`}
            >
              <input
                type="checkbox"
                className="accent-primary mt-0.5 size-4"
                checked={persist}
                disabled={!selected}
                onChange={(e) => setPersist(e.target.checked)}
              />
              <span>
                Save changes back to this context when the session ends
                {persist && otherWriters > 0 && (
                  <span className="block text-xs">
                    {otherWriters} other session{otherWriters === 1 ? " is" : "s are"} also
                    writing — changes are merged, but the same site signed in twice
                    may still sign you out.
                  </span>
                )}
              </span>
            </label>

            {startError && (
              <p className="text-destructive flex items-center gap-1.5 text-sm">
                <AlertTriangle className="size-4 shrink-0" />
                {startError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={start} disabled={startMut.isPending}>
              {startMut.isPending && <Loader2 className="animate-spin" />}
              Start browser
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
