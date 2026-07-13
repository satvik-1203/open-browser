import type { ReactNode } from "react";

/** Shared section header: title + subtitle on the left, actions on the right. */
export function PanelHeader({
  title,
  subtitle,
  actions,
  count,
}: {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  /** Optional subtle count shown next to the title. */
  count?: number;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {count != null && count > 0 && (
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs tabular-nums">
              {count}
            </span>
          )}
        </div>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
