"use client";

import { Badge } from "@repo/ui/components/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import type {
  ActionRecordingEvent,
  ConsoleRecordingEvent,
  NavigationRecordingEvent,
  NetworkRecordingEvent,
} from "@/lib/dashboard/types";
import { Globe, Loader2, MousePointerClick, Terminal } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import { dashboardApi } from "@/lib/dashboard/api";
import { useRecordingEvents } from "@/lib/dashboard/queries";

/**
 * The activity captured alongside a recording, shown as three tabs under the
 * player: Timeline (the actions/navigations the automation drove), Network
 * (requests), and Console (logs + exceptions). All three are derived from the
 * one `events.ndjson` fetched once for the recording.
 */
export function RecordingActivity({
  id,
  enabled,
}: {
  id: string;
  enabled: boolean;
}) {
  const { data, isLoading, isError } = useRecordingEvents(id, enabled);

  const { timeline, network, console, t0 } = useMemo(() => {
    const events = data ?? [];
    const first = events[0]?.ts ?? 0;
    return {
      t0: first,
      timeline: events.filter(
        (e): e is ActionRecordingEvent | NavigationRecordingEvent =>
          e.kind === "action" || e.kind === "navigation",
      ),
      network: events.filter(
        (e): e is NetworkRecordingEvent => e.kind === "network",
      ),
      console: events.filter(
        (e): e is ConsoleRecordingEvent => e.kind === "console",
      ),
    };
  }, [data]);

  if (!enabled) return null;

  if (isLoading) return <ActivitySkeleton />;
  if (isError) {
    return <Panel>Couldn’t load this recording’s activity.</Panel>;
  }
  if (!data || data.length === 0) {
    return <Panel>No activity was captured for this recording.</Panel>;
  }

  return (
    <Tabs defaultValue="timeline" className="mt-6">
      <TabsList>
        <TabsTrigger value="timeline">
          <MousePointerClick /> Timeline
          <Count n={timeline.length} />
        </TabsTrigger>
        <TabsTrigger value="network">
          <Globe /> Network
          <Count n={network.length} />
        </TabsTrigger>
        <TabsTrigger value="console">
          <Terminal /> Console
          <Count n={console.length} />
        </TabsTrigger>
      </TabsList>

      <TabsContent value="timeline">
        <TimelineTab events={timeline} t0={t0} />
      </TabsContent>
      <TabsContent value="network">
        <NetworkTab id={id} events={network} t0={t0} />
      </TabsContent>
      <TabsContent value="console">
        <ConsoleTab events={console} t0={t0} />
      </TabsContent>
    </Tabs>
  );
}

/** Seconds since the first event, e.g. "+2.4s". */
function rel(ts: number, t0: number): string {
  return `+${((ts - t0) / 1000).toFixed(1)}s`;
}

function formatBytes(n?: number): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function urlPath(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || u.hostname;
  } catch {
    return url;
  }
}

// --- Timeline ------------------------------------------------------------

function TimelineTab({
  events,
  t0,
}: {
  events: (ActionRecordingEvent | NavigationRecordingEvent)[];
  t0: number;
}) {
  if (events.length === 0) return <Empty>No actions were captured.</Empty>;
  return (
    <Scroll>
      <ol className="divide-border divide-y">
        {events.map((e, i) => (
          <li key={i} className="flex items-baseline gap-3 px-3 py-2 text-sm">
            <Time>{rel(e.ts, t0)}</Time>
            {e.kind === "action" ? (
              <>
                <span className="text-foreground font-medium">{e.name}</span>
                {e.detail ? (
                  <span className="text-muted-foreground truncate font-mono text-xs">
                    {e.detail}
                  </span>
                ) : null}
              </>
            ) : (
              <>
                <span className="text-foreground font-medium">
                  {e.event === "loadEventFired" ? "load" : "navigate"}
                </span>
                {e.url ? (
                  <span className="text-muted-foreground truncate font-mono text-xs">
                    {e.url}
                  </span>
                ) : null}
              </>
            )}
          </li>
        ))}
      </ol>
    </Scroll>
  );
}

// --- Network -------------------------------------------------------------

function statusVariant(
  e: NetworkRecordingEvent,
): "default" | "secondary" | "destructive" | "outline" {
  if (e.failed || (e.status && e.status >= 400)) return "destructive";
  return "secondary";
}

function NetworkTab({
  id,
  events,
  t0,
}: {
  id: string;
  events: NetworkRecordingEvent[];
  t0: number;
}) {
  if (events.length === 0) return <Empty>No network requests were captured.</Empty>;
  return (
    <Scroll>
      {/* table-fixed: column widths come from the colgroup, never from cell
          content — so expanding a row's body (which can hold huge minified JS)
          can't resize columns or widen the table. */}
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-16" />
          <col className="w-20" />
          <col className="w-20" />
          <col />
          <col className="w-24" />
          <col className="w-20" />
          <col className="w-24" />
        </colgroup>
        <thead className="text-muted-foreground border-border border-b text-left text-xs">
          <tr>
            <th className="px-3 py-1.5 font-medium">Time</th>
            <th className="px-3 py-1.5 font-medium">Method</th>
            <th className="px-3 py-1.5 font-medium">Status</th>
            <th className="px-3 py-1.5 font-medium">Name</th>
            <th className="px-3 py-1.5 font-medium">Type</th>
            <th className="px-3 py-1.5 text-right font-medium">Size</th>
            <th className="px-3 py-1.5 text-right font-medium">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-border divide-y">
          {events.map((e) => (
            <NetworkRow key={e.requestId} id={id} e={e} t0={t0} />
          ))}
        </tbody>
      </table>
    </Scroll>
  );
}

function NetworkRow({
  id,
  e,
  t0,
}: {
  id: string;
  e: NetworkRecordingEvent;
  t0: number;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canInspect = Boolean(e.bodyKey);

  async function toggle() {
    if (!canInspect) return;
    const next = !open;
    setOpen(next);
    if (next && body === null) {
      setLoading(true);
      try {
        const res = await fetch(dashboardApi.recordingBodyUrl(id, e.requestId));
        setBody(await res.text());
      } catch {
        setBody("Failed to load response body.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <>
      <tr
        onClick={toggle}
        className={canInspect ? "hover:bg-muted/50 cursor-pointer" : ""}
      >
        <td className="text-muted-foreground px-3 py-1.5 font-mono text-xs whitespace-nowrap">
          {rel(e.ts, t0)}
        </td>
        <td className="px-3 py-1.5 font-mono text-xs">{e.requestMethod}</td>
        <td className="px-3 py-1.5">
          <Badge variant={statusVariant(e)}>
            {e.failed ? "failed" : (e.status ?? "—")}
          </Badge>
        </td>
        <td className="overflow-hidden px-3 py-1.5">
          <span className="text-foreground block truncate font-mono text-xs" title={e.url}>
            {urlPath(e.url)}
          </span>
        </td>
        <td className="text-muted-foreground px-3 py-1.5 text-xs">
          {e.resourceType ?? "—"}
        </td>
        <td className="text-muted-foreground px-3 py-1.5 text-right font-mono text-xs whitespace-nowrap">
          {formatBytes(e.encodedDataLength ?? e.bodySize)}
        </td>
        <td className="text-muted-foreground px-3 py-1.5 text-right font-mono text-xs whitespace-nowrap">
          {e.durationMs != null ? `${Math.round(e.durationMs)} ms` : "—"}
        </td>
      </tr>
      {open ? (
        <tr>
          <td colSpan={7} className="bg-muted/30 px-3 py-2">
            {loading ? (
              <span className="text-muted-foreground flex items-center gap-2 text-xs">
                <Loader2 className="size-3 animate-spin" /> Loading response…
              </span>
            ) : (
              // Only this box scrolls (both axes); the table stays put.
              <pre className="text-muted-foreground max-h-64 overflow-auto font-mono text-xs whitespace-pre">
                {body}
              </pre>
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

// --- Console -------------------------------------------------------------

function levelClass(level: string): string {
  const l = level.toLowerCase();
  if (l === "error" || l === "exception") return "text-destructive";
  if (l === "warning" || l === "warn") return "text-foreground font-medium";
  return "text-muted-foreground";
}

function ConsoleTab({
  events,
  t0,
}: {
  events: ConsoleRecordingEvent[];
  t0: number;
}) {
  if (events.length === 0) return <Empty>No console output was captured.</Empty>;
  return (
    <Scroll>
      <ol className="divide-border divide-y font-mono text-xs">
        {events.map((e, i) => (
          <ConsoleRow key={i} e={e} t0={t0} />
        ))}
      </ol>
    </Scroll>
  );
}

function ConsoleRow({
  e,
  t0,
}: {
  e: ConsoleRecordingEvent;
  t0: number;
}) {
  const [open, setOpen] = useState(false);
  const tone = levelClass(e.level);
  return (
    <li>
      <div
        onClick={() => setOpen((v) => !v)}
        className="hover:bg-muted/50 flex cursor-pointer items-baseline gap-3 px-3 py-1.5"
      >
        <Time>{rel(e.ts, t0)}</Time>
        <span className={`w-16 shrink-0 uppercase ${tone}`}>
          {e.source === "exception" ? "exception" : e.level}
        </span>
        {/* Collapsed: single truncated line. min-w-0 lets it shrink to truncate. */}
        <span className={`min-w-0 flex-1 truncate ${tone}`}>{e.text}</span>
      </div>
      {open ? (
        // Only this box scrolls; rows above/below don't move.
        <pre
          className={`max-h-64 overflow-auto px-3 pt-0 pb-2 pl-[6.5rem] break-all whitespace-pre-wrap ${tone}`}
        >
          {e.text}
        </pre>
      ) : null}
    </li>
  );
}

// --- Shared bits ---------------------------------------------------------

function Count({ n }: { n: number }) {
  return (
    <span className="text-muted-foreground ml-0.5 text-xs tabular-nums">
      {n}
    </span>
  );
}

function Time({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted-foreground w-12 shrink-0 font-mono text-xs tabular-nums">
      {children}
    </span>
  );
}

function Scroll({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card mt-2 max-h-[28rem] overflow-auto rounded border">
      {children}
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground bg-muted mt-2 rounded border px-3 py-8 text-center text-sm">
      {children}
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground bg-muted mt-6 flex items-center justify-center gap-2 rounded border px-3 py-8 text-center text-sm">
      {children}
    </div>
  );
}

// Varied detail-column widths so the skeleton rows read as real content, not a
// grid. Deterministic (indexed) to stay hydration-safe.
const SKELETON_WIDTHS = ["w-1/2", "w-1/3", "w-3/5", "w-2/5", "w-1/4", "w-1/2"];

/** Loading state shaped like the real tabs + row list, not a bare spinner. */
function ActivitySkeleton() {
  return (
    <div className="mt-6" aria-hidden>
      {/* Tab bar */}
      <div className="bg-muted inline-flex h-9 w-fit items-center gap-1 rounded p-1">
        <Shimmer className="h-6 w-24 rounded-sm" />
        <Shimmer className="h-6 w-24 rounded-sm" />
        <Shimmer className="h-6 w-24 rounded-sm" />
      </div>
      {/* Rows */}
      <div className="bg-card mt-2 overflow-hidden rounded border">
        <div className="divide-border divide-y">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-2.5">
              <Shimmer className="h-3 w-10 shrink-0 rounded" />
              <Shimmer className="h-3 w-14 shrink-0 rounded" />
              <Shimmer
                className={`h-3 rounded ${SKELETON_WIDTHS[i % SKELETON_WIDTHS.length]}`}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Shimmer({ className }: { className?: string }) {
  return (
    <div className={`bg-muted-foreground/10 animate-pulse ${className ?? ""}`} />
  );
}
