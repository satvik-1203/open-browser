export type RecordingStatus =
  | "none"
  | "recording"
  | "processing"
  | "completed"
  | "failed";

export interface RecordingInfo {
  status: RecordingStatus;
  /** Object key within the adapter's bucket, once uploaded. */
  key?: string;
  /** Resolvable URL to the stored recording, once uploaded. */
  url?: string;
  /** Present when status is "failed". */
  error?: string;
}
