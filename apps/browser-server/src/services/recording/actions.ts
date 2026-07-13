import type { ActionRecordingEvent } from "@repo/types";

/**
 * The browser server proxies the client's CDP websocket, so every command the
 * client sends flows through it as a JSON-RPC frame `{ id, method, params }`.
 * The client→browser direction is the stream of *actions* the automation drove.
 *
 * That stream is noisy — capability negotiation, polling, `*.enable` setup — so
 * we keep only the methods that represent a meaningful user/automation action.
 * Each entry maps a CDP method to a humanized action name; `summarizeAction`
 * turns the frame's params into a short human-readable detail string.
 */
const ACTION_NAMES: Record<string, string> = {
  "Input.dispatchMouseEvent": "click",
  "Input.dispatchKeyEvent": "key",
  "Input.insertText": "type",
  "Input.dispatchTouchEvent": "touch",
  "Input.dispatchDragEvent": "drag",
  "Page.navigate": "navigate",
  "Page.reload": "reload",
  "Page.goBack": "back",
  "Page.goForward": "forward",
  "Runtime.evaluate": "evaluate",
  "Runtime.callFunctionOn": "evaluate",
  "DOM.focus": "focus",
  "DOM.setFileInputFiles": "upload",
};

/** Whether a CDP command method is one we record as a browser action. */
export function isActionMethod(method: string): boolean {
  return method in ACTION_NAMES;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

/** Truncate long strings (evaluate expressions, typed text) for the detail. */
function clip(value: string, max = 80): string {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/**
 * Build the humanized `{ name, detail }` for a recorded action frame. `params`
 * is the raw CDP command params; shapes vary by method, so every field access
 * is defensive.
 */
export function summarizeAction(
  method: string,
  params: unknown,
): Pick<ActionRecordingEvent, "name" | "detail"> {
  const name = ACTION_NAMES[method] ?? method;
  const p = (params ?? {}) as Record<string, unknown>;

  switch (method) {
    case "Input.dispatchMouseEvent": {
      const type = str(p.type);
      // A drag/scroll surfaces as a wheel event; a press is the "click".
      if (type === "mouseWheel") {
        return { name: "scroll", detail: `Δ${num(p.deltaY) ?? 0},${num(p.deltaX) ?? 0}` };
      }
      const x = num(p.x);
      const y = num(p.y);
      const at = x != null && y != null ? `(${Math.round(x)}, ${Math.round(y)})` : undefined;
      return { name: type === "mousePressed" ? "click" : name, detail: at };
    }
    case "Input.dispatchKeyEvent": {
      const key = str(p.key) ?? str(p.code);
      return { name, detail: key };
    }
    case "Input.insertText":
      return { name, detail: str(p.text) ? clip(str(p.text)!) : undefined };
    case "Page.navigate":
      return { name, detail: str(p.url) };
    case "DOM.setFileInputFiles": {
      const files = Array.isArray(p.files) ? p.files.length : undefined;
      return { name, detail: files != null ? `${files} file(s)` : undefined };
    }
    case "Runtime.evaluate":
      return { name, detail: str(p.expression) ? clip(str(p.expression)!) : undefined };
    case "Runtime.callFunctionOn":
      return {
        name,
        detail: str(p.functionDeclaration)
          ? clip(str(p.functionDeclaration)!)
          : undefined,
      };
    default:
      return { name };
  }
}

/**
 * Which client→browser CDP command frames should be recorded, if any. Returns
 * the parsed `{ method, params }` for an action frame, or `null` to ignore.
 * Mouse *moves* are dropped even though they're `Input.dispatchMouseEvent` —
 * they fire in the thousands and drown the timeline; presses/wheels survive.
 */
export function parseActionFrame(
  raw: string,
): { method: string; params: unknown } | null {
  let frame: { method?: unknown; params?: unknown };
  try {
    frame = JSON.parse(raw) as { method?: unknown; params?: unknown };
  } catch {
    return null;
  }
  const method = str(frame.method);
  if (!method || !isActionMethod(method)) return null;

  if (method === "Input.dispatchMouseEvent") {
    // A click is press+release (often preceded by moves); keep only the press so
    // one gesture is one row. Wheels (scrolls) are kept — each is meaningful.
    const type = str((frame.params as Record<string, unknown> | undefined)?.type);
    if (type !== "mousePressed" && type !== "mouseWheel") return null;
  }
  // A keypress is keyDown+keyUp; keep only the down.
  if (method === "Input.dispatchKeyEvent") {
    const type = str((frame.params as Record<string, unknown> | undefined)?.type);
    if (type === "keyUp") return null;
  }
  return { method, params: frame.params };
}
