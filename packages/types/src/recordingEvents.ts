/**
 * A recording's activity is stored — after finalize — as a single
 * newline-delimited JSON file (`{id}/events.ndjson`) of these rows, sorted by
 * `ts`. It is derived from the raw CDP capture but deliberately light: response
 * bodies live in separate objects (`{id}/bodies/{requestId}`) so the timeline,
 * network, and console views load without pulling megabytes of payload.
 */

export type RecordingEventKind =
  | "network"
  | "console"
  | "action"
  | "navigation";

interface BaseRecordingEvent {
  /** Event time (epoch milliseconds). */
  ts: number;
  kind: RecordingEventKind;
  /** CDP target the event came from (page or sub-frame/worker). */
  targetId: string;
}

/**
 * One network request, collapsed across its CDP lifecycle
 * (`requestWillBeSent` → `responseReceived` → `loadingFinished`/`Failed`) into a
 * single row keyed by `requestId`.
 */
export interface NetworkRecordingEvent extends BaseRecordingEvent {
  kind: "network";
  requestId: string;
  /** HTTP method (GET/POST/…). */
  requestMethod: string;
  url: string;
  /** CDP resource type (Document, XHR, Fetch, Image, …). */
  resourceType?: string;
  /** From `responseReceived`; absent if the request never got a response. */
  status?: number;
  statusText?: string;
  mimeType?: string;
  /** From `loadingFinished` — total bytes over the wire. */
  encodedDataLength?: number;
  /** Request → completion, in milliseconds. */
  durationMs?: number;
  /** True when the request failed (`loadingFailed`). */
  failed?: boolean;
  errorText?: string;
  /** Size of the captured response body, if one was stored. */
  bodySize?: number;
  /** Storage key of the captured response body object, if any. */
  bodyKey?: string;
}

/** A console message or uncaught exception. */
export interface ConsoleRecordingEvent extends BaseRecordingEvent {
  kind: "console";
  /** log | info | warning | error | debug | exception. */
  level: string;
  text: string;
  source: "console" | "exception" | "log-entry";
  url?: string;
  lineNumber?: number;
}

/**
 * A browser action the client drove over CDP — a click, scroll, keypress,
 * navigation, evaluate, etc. — humanized from the raw command frame.
 */
export interface ActionRecordingEvent extends BaseRecordingEvent {
  kind: "action";
  /** Humanized action name: click, scroll, type, key, navigate, evaluate, … */
  name: string;
  /** Raw CDP method the action came from (e.g. Input.dispatchMouseEvent). */
  method: string;
  /** Short human-readable detail (coordinates, key, url, snippet). */
  detail?: string;
}

/** A page/frame navigation or load milestone. */
export interface NavigationRecordingEvent extends BaseRecordingEvent {
  kind: "navigation";
  event: "frameNavigated" | "loadEventFired";
  url?: string;
}

export type RecordingEvent =
  | NetworkRecordingEvent
  | ConsoleRecordingEvent
  | ActionRecordingEvent
  | NavigationRecordingEvent;

/** Response for the recording-events endpoint when returned as parsed JSON. */
export interface GetRecordingEventsResponse {
  events: RecordingEvent[];
}
