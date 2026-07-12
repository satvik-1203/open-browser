import { Globe } from "lucide-react";

/**
 * Brand mark.
 * - `badge` (default): blue icon tile + wordmark, for light surfaces.
 * - `mono`: plain icon + wordmark in currentColor, for colored banners.
 */
export function Brand({
  variant = "badge",
  withWordmark = true,
}: {
  variant?: "badge" | "mono";
  withWordmark?: boolean;
}) {
  if (variant === "mono") {
    return (
      <div className="flex items-center gap-2">
        <Globe className="size-6" strokeWidth={2.2} />
        {withWordmark ? (
          <span className="text-lg font-semibold tracking-tight">
            Open Browser
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded">
        <Globe className="size-5" strokeWidth={2.2} />
      </span>
      {withWordmark ? (
        <span className="text-lg font-semibold tracking-tight">
          Open Browser
        </span>
      ) : null}
    </div>
  );
}
