"use client";

import { cn } from "@repo/ui/lib/utils";
import { Plus, X } from "lucide-react";

import type { BrowserTabs } from "@/lib/dashboard/use-browser-tabs";

/** A short, recognizable label for a tab: its title, else its host. */
function tabLabel(title: string, url: string): string {
  const trimmed = title.trim();
  if (trimmed) return trimmed;
  try {
    const { hostname, protocol } = new URL(url);
    // about:blank and friends have no host — show the scheme-y thing itself,
    // which is what Chrome does for a fresh tab.
    return hostname || url || protocol;
  } catch {
    return url || "New tab";
  }
}

/**
 * Chrome-style strip of the session's open tabs. Clicking one foregrounds it
 * and points the live view at it; the strip updates itself when the automation
 * opens or closes tabs on its own.
 */
export function BrowserTabStrip({
  tabs,
  activeTargetId,
  select,
  createTab,
  closeTab,
}: BrowserTabs) {
  // Nothing discovered yet (still connecting, or discovery failed) — render
  // nothing rather than an empty strip. A single tab still gets one, since the
  // "+" button is the only way to open another.
  if (tabs.length === 0) return null;

  return (
    <div className="bg-muted/40 flex items-stretch gap-0.5 overflow-x-auto border-b px-1 pt-1">
      {tabs.map((tab) => {
        const active = tab.targetId === activeTargetId;
        return (
          <div
            key={tab.targetId}
            role="tab"
            aria-selected={active}
            tabIndex={0}
            title={tab.url}
            onClick={() => select(tab.targetId)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                select(tab.targetId);
              }
            }}
            className={cn(
              "group flex min-w-0 max-w-[12rem] flex-1 cursor-pointer items-center gap-1.5 rounded-t border-x border-t px-2.5 py-1.5 text-xs transition-colors",
              "focus-visible:ring-ring outline-none focus-visible:ring-2",
              active
                ? "bg-card text-foreground border-border"
                : "text-muted-foreground hover:bg-card/60 border-transparent",
            )}
          >
            <span className="min-w-0 flex-1 truncate">
              {tabLabel(tab.title, tab.url)}
            </span>
            {/* Chrome keeps the last tab closable (it exits); here closing it
                would strand the live view, so the control is withheld. */}
            {tabs.length > 1 && (
              <button
                type="button"
                aria-label={`Close ${tabLabel(tab.title, tab.url)}`}
                className={cn(
                  "hover:bg-muted-foreground/20 shrink-0 rounded p-0.5 transition-opacity",
                  active ? "opacity-60" : "opacity-0 group-hover:opacity-60",
                )}
                onClick={(e) => {
                  // Don't let the click select the tab on its way out.
                  e.stopPropagation();
                  closeTab(tab.targetId);
                }}
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        aria-label="New tab"
        onClick={createTab}
        className="text-muted-foreground hover:text-foreground hover:bg-card/60 focus-visible:ring-ring my-0.5 shrink-0 rounded px-2 outline-none transition-colors focus-visible:ring-2"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
