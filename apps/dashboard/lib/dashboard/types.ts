import type {
  ActionRecordingEvent,
  BrowserSessionRecord,
  ConsoleRecordingEvent,
  GetBrowserResponse,
  GetRecordingUrlResponse,
  NavigationRecordingEvent,
  NetworkRecordingEvent,
  RecordingEvent,
  RecordingEventKind,
  StartBrowserOptions,
  StartBrowserResponse,
} from "@repo/types";

/** API token metadata as returned by `GET /api/tokens` (never the raw token). */
export interface ApiTokenRecord {
  id: string;
  name: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** Response of `POST /api/tokens` — the raw token is present exactly once. */
export interface CreatedApiToken {
  token: string;
  id: string;
  name: string;
  createdAt: string;
}

/** The three management sections rendered in the sidebar. */
export type DashboardSection = "keys" | "browsers" | "recordings";

export type {
  ActionRecordingEvent,
  BrowserSessionRecord,
  ConsoleRecordingEvent,
  GetBrowserResponse,
  GetRecordingUrlResponse,
  NavigationRecordingEvent,
  NetworkRecordingEvent,
  RecordingEvent,
  RecordingEventKind,
  StartBrowserOptions,
  StartBrowserResponse,
};
