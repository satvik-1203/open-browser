"use client";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** Copy-to-clipboard button that briefly flips to a check on success. */
export function CopyButton({
  value,
  label,
  className,
  size = "icon-sm",
}: {
  value: string;
  label?: string;
  className?: string;
  size?: "icon-sm" | "sm";
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked (insecure context); nothing to do.
    }
  }

  const Icon = copied ? Check : Copy;

  if (label) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className}
        onClick={copy}
      >
        <Icon className={cn(copied && "text-primary")} />
        {copied ? "Copied" : label}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={size}
      className={className}
      onClick={copy}
      aria-label="Copy"
    >
      <Icon className={cn(copied && "text-primary")} />
    </Button>
  );
}
