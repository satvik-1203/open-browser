"use client";

import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";
import {
  KeyRound,
  MonitorPlay,
  PanelLeftClose,
  PanelLeftOpen,
  Video,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";

import { useBrowsersQuery } from "@/lib/dashboard/queries";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Whether this item is the active section for the current pathname. */
  isActive: (pathname: string) => boolean;
}

const NAV: NavItem[] = [
  {
    href: "/",
    label: "Browsers",
    icon: MonitorPlay,
    // Home is the browsers list; detail lives under /browsers/[id].
    isActive: (p) => p === "/" || p.startsWith("/browsers"),
  },
  {
    href: "/recordings",
    label: "Recordings",
    icon: Video,
    isActive: (p) => p.startsWith("/recordings"),
  },
  {
    href: "/keys",
    label: "API Keys",
    icon: KeyRound,
    isActive: (p) => p.startsWith("/keys"),
  },
];

const STORAGE_KEY = "ob:sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Restore persisted collapse state after mount (avoids hydration mismatch).
  useEffect(() => {
    setCollapsed(localStorage.getItem(STORAGE_KEY) === "1");
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  }

  // Subtle live-browser count shown on the Browsers nav item.
  const browsers = useBrowsersQuery();
  const liveCount = browsers.data?.sessions.length ?? 0;

  return (
    <div className="flex flex-1 overflow-hidden">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r bg-card/40 p-2 transition-[width] duration-200",
          collapsed ? "w-14" : "w-56",
        )}
      >
        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const active = item.isActive(pathname);
            const Icon = item.icon;
            const count = item.href === "/" ? liveCount : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 rounded px-2.5 text-sm font-medium transition-colors",
                  collapsed && "justify-center px-0",
                  active
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <span className="relative flex shrink-0">
                  <Icon
                    className={cn(
                      "size-4",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  {collapsed && count > 0 && (
                    <span className="bg-primary absolute -top-1 -right-1 size-1.5 rounded-full" />
                  )}
                </span>
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && count > 0 && (
                  <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                    {count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "text-muted-foreground w-full",
            collapsed ? "justify-center px-0" : "justify-start",
          )}
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          {!collapsed && "Collapse"}
        </Button>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
