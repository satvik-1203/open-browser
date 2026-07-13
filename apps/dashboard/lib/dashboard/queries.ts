import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import { dashboardApi } from "./api";
import {
  createApiToken,
  listApiTokens,
  revokeApiToken,
} from "./token-actions";
import type {
  BrowserSessionRecord,
  StartBrowserOptions,
} from "./types";

const ACTIVE_STATUSES = new Set(["starting", "running", "stopping"]);

/** Centralized query keys so invalidation stays consistent. */
export const qk = {
  browsers: ["browsers"] as const,
  browserLive: (id: string) => ["browser-live", id] as const,
  sessionRecord: (id: string) => ["session-record", id] as const,
  sessionSearch: (id: string) => ["session-search", id] as const,
  recordings: (pageSize: number) => ["recordings", pageSize] as const,
  recordingUrl: (id: string) => ["recording-url", id] as const,
  tokens: ["tokens"] as const,
};

// --- Browsers ------------------------------------------------------------

/** Every session; polls while any is mid-lifecycle so status settles live. */
export function useBrowsersQuery() {
  return useQuery({
    queryKey: qk.browsers,
    queryFn: () => dashboardApi.listBrowsers(),
    refetchInterval: (query) => {
      const hasActive = query.state.data?.sessions.some((s) =>
        ACTIVE_STATUSES.has(s.status),
      );
      return hasActive ? 4000 : false;
    },
  });
}

/**
 * A single session's DB record (status, recording status), by exact id. Polls
 * every 4s while the session is mid-lifecycle so the detail view settles live;
 * pass `{ poll: false }` when the caller drives its own refetch cadence.
 */
export function useSessionRecord(id: string, options?: { poll?: boolean }) {
  const poll = options?.poll ?? true;
  return useQuery({
    queryKey: qk.sessionRecord(id),
    queryFn: (): Promise<BrowserSessionRecord | null> =>
      dashboardApi.listBrowsers({ id }).then((r) => r.sessions[0] ?? null),
    refetchInterval: (query) => {
      if (!poll) return false;
      const rec = query.state.data;
      return rec && ACTIVE_STATUSES.has(rec.status) ? 4000 : false;
    },
  });
}

/** Live CDP detail from the browser server, for an active session. */
export function useBrowserLive(id: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.browserLive(id),
    queryFn: () => dashboardApi.getBrowser(id),
    enabled,
  });
}

export function useStartBrowser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (options: StartBrowserOptions) =>
      dashboardApi.startBrowser(options),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.browsers }),
  });
}

export function useStopBrowser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dashboardApi.stopBrowser(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.browsers }),
  });
}

// --- Recordings ----------------------------------------------------------

/**
 * One cursor page of recorded sessions. Uses `keepPreviousData` so the table
 * doesn't flash empty while flipping between pages (React Query's paginated
 * pattern). `cursor` is null for the first page.
 */
export function useRecordedSessionsPage(pageSize: number, cursor: string | null) {
  return useQuery({
    queryKey: [...qk.recordings(pageSize), cursor] as const,
    queryFn: () =>
      dashboardApi.listBrowsers({
        recorded: true,
        limit: pageSize,
        cursor,
      }),
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const anyPending = query.state.data?.sessions.some(
        (s) =>
          s.recordingStatus === "recording" ||
          s.recordingStatus === "processing",
      );
      return anyPending ? 5000 : false;
    },
  });
}

/** Exact-id search over sessions (used by the recordings search box). */
export function useSessionSearch(id: string) {
  const trimmed = id.trim();
  return useQuery({
    queryKey: qk.sessionSearch(trimmed),
    queryFn: (): Promise<BrowserSessionRecord | null> =>
      dashboardApi.listBrowsers({ id: trimmed }).then((r) => r.sessions[0] ?? null),
    enabled: trimmed.length > 0,
  });
}

/** Resolve a recording's playable URL (from S3). */
export function useRecordingUrl(id: string, enabled: boolean) {
  return useQuery({
    queryKey: qk.recordingUrl(id),
    queryFn: () => dashboardApi.getRecordingUrl(id),
    enabled,
    // Storage can lag the "completed" flag by a beat; give it a few tries.
    retry: 5,
    retryDelay: 1500,
  });
}

// --- API keys ------------------------------------------------------------

export function useTokensQuery() {
  return useQuery({
    queryKey: qk.tokens,
    queryFn: () => listApiTokens(),
  });
}

export function useCreateToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await createApiToken(name);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tokens }),
  });
}

export function useRevokeToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await revokeApiToken(id);
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tokens }),
  });
}
