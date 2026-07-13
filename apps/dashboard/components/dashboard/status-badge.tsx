import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";
import type {
  BrowserSessionStatus,
  RecordingStatus,
} from "@repo/types";

/** A pulsing dot used to signal a live/active state. */
function Dot({ className }: { className?: string }) {
  return (
    <span className="relative flex size-1.5">
      <span
        className={cn(
          "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
          className,
        )}
      />
      <span
        className={cn("relative inline-flex size-1.5 rounded-full", className)}
      />
    </span>
  );
}

const SESSION_LABELS: Record<BrowserSessionStatus, string> = {
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  stopped: "Stopped",
  failed: "Failed",
  "server-error": "Server error",
};

export function SessionStatusBadge({
  status,
}: {
  status: BrowserSessionStatus;
}) {
  const label = SESSION_LABELS[status] ?? status;

  if (status === "running") {
    return (
      <Badge variant="outline" className="gap-1.5 border-primary/40 text-primary">
        <Dot className="bg-primary" />
        {label}
      </Badge>
    );
  }
  if (status === "starting" || status === "stopping") {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <Dot className="bg-muted-foreground" />
        {label}
      </Badge>
    );
  }
  if (status === "failed" || status === "server-error") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  return <Badge variant="secondary">{label}</Badge>;
}

const RECORDING_LABELS: Record<RecordingStatus, string> = {
  none: "No recording",
  recording: "Recording",
  processing: "Processing",
  completed: "Ready",
  failed: "Failed",
};

export function RecordingStatusBadge({
  status,
}: {
  status: RecordingStatus;
}) {
  const label = RECORDING_LABELS[status] ?? status;
  if (status === "completed") {
    return <Badge variant="outline" className="border-primary/40 text-primary">{label}</Badge>;
  }
  if (status === "recording") {
    return (
      <Badge variant="outline" className="gap-1.5 text-foreground">
        <Dot className="bg-destructive" />
        {label}
      </Badge>
    );
  }
  if (status === "failed") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  if (status === "processing") {
    return <Badge variant="secondary">{label}</Badge>;
  }
  return <Badge variant="secondary">{label}</Badge>;
}
