export type RecordingStatus =
  | "none"
  | "recording"
  | "processing"
  | "completed"
  | "failed";

export interface RecordingInfo {
  status: RecordingStatus;
  /** Present when status is "failed". */
  error?: string;
}
