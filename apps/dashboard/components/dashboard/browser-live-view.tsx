"use client";

import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { cn } from "@repo/ui/lib/utils";
import { ArrowLeft, ArrowRight, Loader2, MonitorX, RotateCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type * as React from "react";

import {
  CdpConnection,
  type ScreencastFrame,
  type ScreencastMetadata,
} from "@/lib/dashboard/cdp";

type Status = "connecting" | "streaming" | "error";

/**
 * Live view of a running browser via CDP screencast — just the page, no DevTools
 * chrome. `Page.startScreencast` streams JPEG frames (only on repaint, so idle
 * costs ~nothing); we render each to an <img> and, when `interactive`, forward
 * mouse/keyboard as `Input.*` events plus a browser-style URL bar (back /
 * forward / reload / navigate via `Page.navigate`).
 */
export function BrowserLiveView({
  wsUrl,
  interactive = false,
  className,
}: {
  wsUrl: string;
  interactive?: boolean;
  className?: string;
}) {
  const [status, setStatus] = useState<Status>("connecting");
  const [address, setAddress] = useState("");
  const editingRef = useRef(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const metaRef = useRef<ScreencastMetadata | null>(null);
  const connRef = useRef<CdpConnection | null>(null);

  useEffect(() => {
    let disposed = false;
    let gotFrame = false;
    const conn = new CdpConnection(wsUrl);
    connRef.current = conn;

    // If the socket opens but no frame ever arrives, the view sits on
    // "Connecting…" indefinitely. The usual cause is that the screencast target
    // tab is backgrounded/occluded — Chrome only paints (and thus screencasts)
    // the foreground tab, so a second open tab starves this one. Flag it.
    const noFrameWatchdog = setTimeout(() => {
      if (!disposed && !gotFrame) {
        console.warn(
          "[live-view] connected but no screencast frame after 8s — the target " +
            "tab is likely backgrounded/occluded (only the foreground tab paints) " +
            "or the session has stalled",
        );
      }
    }, 8000);

    const offFrame = conn.on("Page.screencastFrame", (raw) => {
      const frame = raw as ScreencastFrame;
      if (disposed) return;
      gotFrame = true;
      metaRef.current = frame.metadata;
      if (imgRef.current) {
        imgRef.current.src = `data:image/jpeg;base64,${frame.data}`;
      }
      setStatus("streaming");
      conn.notify("Page.screencastFrameAck", { sessionId: frame.sessionId });
    });

    // Keep the URL bar in sync with the page's own navigation (unless the user
    // is mid-edit in the input).
    const offNav = conn.on("Page.frameNavigated", (raw) => {
      const p = raw as { frame?: { url?: string; parentId?: string } };
      if (p.frame && !p.frame.parentId && !editingRef.current) {
        setAddress(p.frame.url ?? "");
      }
    });

    (async () => {
      try {
        await conn.ready();
        await conn.send("Page.enable");
        await conn.send("Page.startScreencast", {
          format: "jpeg",
          quality: interactive ? 80 : 55,
          everyNthFrame: interactive ? 1 : 2,
          maxWidth: interactive ? 1920 : 1280,
          maxHeight: interactive ? 1080 : 720,
        });
        if (interactive) {
          try {
            const hist = await conn.send<{
              currentIndex: number;
              entries: { url: string }[];
            }>("Page.getNavigationHistory");
            if (!disposed && !editingRef.current) {
              setAddress(hist.entries[hist.currentIndex]?.url ?? "");
            }
          } catch {
            // Non-fatal — the URL bar just starts empty.
          }
        }
      } catch (err) {
        // The page-target socket never came up (session gone, browser crashed,
        // or the screencast command failed). Log it — otherwise the view just
        // flips to "Live view unavailable" with no clue why.
        console.warn("[live-view] failed to start screencast", err);
        if (!disposed) setStatus("error");
      }
    })();

    return () => {
      disposed = true;
      clearTimeout(noFrameWatchdog);
      offFrame();
      offNav();
      conn.notify("Page.stopScreencast");
      conn.close();
      connRef.current = null;
    };
  }, [wsUrl, interactive]);

  // --- Navigation ---------------------------------------------------------

  function navigate(raw: string) {
    let url = raw.trim();
    if (!url) return;
    if (!/^[a-z]+:\/\//i.test(url)) url = `https://${url}`;
    connRef.current?.send("Page.navigate", { url }).catch(() => {});
  }

  // --- Input forwarding (interactive only) --------------------------------

  function toPageCoords(clientX: number, clientY: number) {
    const el = imgRef.current;
    const meta = metaRef.current;
    if (!el || !meta || !el.naturalWidth) return null;

    const rect = el.getBoundingClientRect();
    const natRatio = el.naturalWidth / el.naturalHeight;
    const elRatio = rect.width / rect.height;
    let cw = rect.width;
    let ch = rect.height;
    let ox = 0;
    let oy = 0;
    if (natRatio > elRatio) {
      ch = rect.width / natRatio;
      oy = (rect.height - ch) / 2;
    } else {
      cw = rect.height * natRatio;
      ox = (rect.width - cw) / 2;
    }
    const fx = (clientX - rect.left - ox) / cw;
    const fy = (clientY - rect.top - oy) / ch;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    return { x: fx * meta.deviceWidth, y: fy * meta.deviceHeight };
  }

  // CDP modifier bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8.
  function modifiers(e: React.MouseEvent | React.KeyboardEvent): number {
    return (
      (e.altKey ? 1 : 0) |
      (e.ctrlKey ? 2 : 0) |
      (e.metaKey ? 4 : 0) |
      (e.shiftKey ? 8 : 0)
    );
  }

  const MOUSE_BUTTONS = ["left", "middle", "right"] as const;

  function mouse(
    type: "mousePressed" | "mouseReleased" | "mouseMoved",
    e: React.MouseEvent,
  ) {
    const conn = connRef.current;
    const pt = toPageCoords(e.clientX, e.clientY);
    if (!conn || !pt) return;
    conn.notify("Input.dispatchMouseEvent", {
      type,
      x: pt.x,
      y: pt.y,
      modifiers: modifiers(e),
      button: type === "mouseMoved" ? "none" : (MOUSE_BUTTONS[e.button] ?? "left"),
      buttons: e.buttons,
      clickCount: type === "mouseMoved" ? 0 : e.detail || 1,
    });
  }

  function key(type: "keyDown" | "keyUp", e: React.KeyboardEvent) {
    const conn = connRef.current;
    if (!conn) return;
    e.preventDefault();
    const mods = modifiers(e);
    const printable = e.key.length === 1;
    const text =
      e.key === "Enter"
        ? "\r"
        : e.key === "Tab"
          ? ""
          : printable && !(mods & 2) && !(mods & 4)
            ? e.key
            : "";
    conn.notify("Input.dispatchKeyEvent", {
      type: type === "keyUp" ? "keyUp" : text ? "keyDown" : "rawKeyDown",
      modifiers: mods,
      key: e.key,
      code: e.code,
      windowsVirtualKeyCode: e.keyCode || 0,
      nativeVirtualKeyCode: e.keyCode || 0,
      autoRepeat: e.repeat,
      location: e.location,
      isKeypad: e.location === 3,
      text: type === "keyDown" ? text : undefined,
      unmodifiedText: type === "keyDown" ? text : undefined,
    });
  }

  const inputHandlers = {
    tabIndex: 0,
    onMouseDown: (e: React.MouseEvent) => {
      (e.currentTarget as HTMLElement).focus();
      mouse("mousePressed", e);
    },
    onMouseUp: (e: React.MouseEvent) => mouse("mouseReleased", e),
    onMouseMove: (e: React.MouseEvent) => mouse("mouseMoved", e),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onWheel: (e: React.WheelEvent) => {
      const conn = connRef.current;
      const pt = toPageCoords(e.clientX, e.clientY);
      if (!conn || !pt) return;
      conn.notify("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: pt.x,
        y: pt.y,
        modifiers: modifiers(e),
        deltaX: e.deltaX,
        deltaY: e.deltaY,
      });
    },
    onKeyDown: (e: React.KeyboardEvent) => key("keyDown", e),
    onKeyUp: (e: React.KeyboardEvent) => key("keyUp", e),
  };

  const overlays = (
    <>
      {status === "connecting" && (
        <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs">
          <Loader2 className="size-5 animate-spin" />
          Connecting…
        </div>
      )}
      {status === "error" && (
        <div className="text-muted-foreground absolute inset-0 flex flex-col items-center justify-center gap-2 text-xs">
          <MonitorX className="size-5" />
          Live view unavailable
        </div>
      )}
    </>
  );

  // View-only (cards): fill the parent, no chrome, clicks pass through.
  if (!interactive) {
    return (
      <div className={cn("bg-muted relative h-full w-full overflow-hidden", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="Live browser"
          draggable={false}
          className={cn(
            "pointer-events-none h-full w-full object-contain transition-opacity",
            status === "streaming" ? "opacity-100" : "opacity-0",
          )}
        />
        {overlays}
      </div>
    );
  }

  // Interactive (detail): URL bar on top, 16:9 controllable screencast below.
  return (
    <div className={cn("bg-card flex w-full flex-col", className)}>
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          className="text-muted-foreground"
          onClick={() =>
            connRef.current?.send("Runtime.evaluate", {
              expression: "history.back()",
            })
          }
        >
          <ArrowLeft />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Forward"
          className="text-muted-foreground"
          onClick={() =>
            connRef.current?.send("Runtime.evaluate", {
              expression: "history.forward()",
            })
          }
        >
          <ArrowRight />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Reload"
          className="text-muted-foreground"
          onClick={() => connRef.current?.send("Page.reload", {})}
        >
          <RotateCw />
        </Button>
        <form
          className="flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(address);
            editingRef.current = false;
            (document.activeElement as HTMLElement | null)?.blur?.();
          }}
        >
          <Input
            value={address}
            placeholder="Enter a URL and press Enter…"
            onChange={(e) => setAddress(e.target.value)}
            onFocus={() => {
              editingRef.current = true;
            }}
            onBlur={() => {
              editingRef.current = false;
            }}
            className="h-8 font-mono text-xs"
          />
        </form>
      </div>

      <div
        className="bg-muted relative flex aspect-video w-full items-center justify-center overflow-hidden outline-none focus-visible:ring-ring focus-visible:ring-2 cursor-crosshair"
        {...inputHandlers}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          alt="Live browser"
          draggable={false}
          className={cn(
            "h-full w-full object-contain transition-opacity",
            status === "streaming" ? "opacity-100" : "opacity-0",
          )}
        />
        {overlays}
      </div>
    </div>
  );
}
