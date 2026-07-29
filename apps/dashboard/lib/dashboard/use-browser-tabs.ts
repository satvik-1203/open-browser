"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CdpConnection, type BrowserTargetInfo } from "./cdp";

export interface BrowserTabs {
  tabs: BrowserTargetInfo[];
  /** Target currently shown in the live view, or null before the list loads. */
  activeTargetId: string | null;
  /** Show a tab: brings it to the foreground, then selects it. */
  select: (targetId: string) => void;
  createTab: () => void;
  closeTab: (targetId: string) => void;
}

/**
 * Track a session's open tabs over a browser-level CDP connection.
 *
 * This is a second, separate socket from the live view's: the live view is
 * attached to one *page* target, which by definition can't see the others.
 * `Target.setDiscoverTargets` then keeps the list live, so a tab the automation
 * opens itself (a `window.open`, an OAuth popup) appears without polling.
 */
export function useBrowserTabs(
  browserWsUrl: string | null,
  enabled = true,
): BrowserTabs {
  const [tabs, setTabs] = useState<BrowserTargetInfo[]>([]);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const connRef = useRef<CdpConnection | null>(null);

  useEffect(() => {
    if (!browserWsUrl || !enabled) {
      setTabs([]);
      setActiveTargetId(null);
      return;
    }

    let disposed = false;
    const conn = new CdpConnection(browserWsUrl);
    connRef.current = conn;

    // Only real tabs. Target discovery also reports iframes, workers and the
    // browser itself, none of which a user can switch to.
    const isTab = (t: BrowserTargetInfo) => t.type === "page";

    const upsert = (target: BrowserTargetInfo) => {
      if (!isTab(target)) return;
      setTabs((prev) => {
        const next = prev.slice();
        const at = next.findIndex((t) => t.targetId === target.targetId);
        if (at === -1) next.push(target);
        else next[at] = target;
        return next;
      });
    };

    const offCreated = conn.on("Target.targetCreated", (raw) => {
      if (disposed) return;
      upsert((raw as { targetInfo: BrowserTargetInfo }).targetInfo);
    });

    // Fires on title/URL changes too, which is what keeps a tab's label
    // current as the page navigates.
    const offChanged = conn.on("Target.targetInfoChanged", (raw) => {
      if (disposed) return;
      upsert((raw as { targetInfo: BrowserTargetInfo }).targetInfo);
    });

    const offDestroyed = conn.on("Target.targetDestroyed", (raw) => {
      if (disposed) return;
      const { targetId } = raw as { targetId: string };
      setTabs((prev) => prev.filter((t) => t.targetId !== targetId));
      // If the tab being viewed just closed, fall back to another one rather
      // than leaving the live view pointed at a dead socket.
      setActiveTargetId((current) => {
        if (current !== targetId) return current;
        return null;
      });
    });

    void (async () => {
      try {
        await conn.ready();
        const { targetInfos } = await conn.send<{
          targetInfos: BrowserTargetInfo[];
        }>("Target.getTargets");
        if (disposed) return;
        const pages = targetInfos.filter(isTab);
        setTabs(pages);
        setActiveTargetId((current) => current ?? pages[0]?.targetId ?? null);
        // Subscribe only after the initial list, so the two can't interleave
        // into a duplicated entry.
        await conn.send("Target.setDiscoverTargets", { discover: true });
      } catch (err) {
        // Non-fatal: the live view still works on its own target, it just
        // won't show a tab strip.
        console.warn("[tabs] failed to enumerate targets", err);
      }
    })();

    return () => {
      disposed = true;
      offCreated();
      offChanged();
      offDestroyed();
      conn.close();
      connRef.current = null;
    };
  }, [browserWsUrl, enabled]);

  // When the active tab closes, adopt whatever is left.
  useEffect(() => {
    if (activeTargetId === null && tabs.length > 0) {
      setActiveTargetId(tabs[0]!.targetId);
    }
  }, [activeTargetId, tabs]);

  const select = useCallback((targetId: string) => {
    setActiveTargetId(targetId);
    // Chrome only paints the foreground tab, so a screencast attached to a
    // background tab receives no frames at all. Activating it is what makes
    // switching actually show anything — without this the view would connect
    // and then sit blank forever.
    connRef.current?.send("Target.activateTarget", { targetId }).catch(() => {});
  }, []);

  const createTab = useCallback(() => {
    void connRef.current
      ?.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" })
      .then(({ targetId }) => select(targetId))
      .catch(() => {});
  }, [select]);

  const closeTab = useCallback((targetId: string) => {
    // The list updates from the resulting `Target.targetDestroyed` event, so
    // there's nothing to prune here.
    connRef.current?.send("Target.closeTarget", { targetId }).catch(() => {});
  }, []);

  return { tabs, activeTargetId, select, createTab, closeTab };
}
