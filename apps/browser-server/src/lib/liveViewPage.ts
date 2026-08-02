/**
 * The embeddable live view: a single self-contained HTML page showing *only*
 * the browser's viewport, for dropping into a customer's `<iframe>`.
 *
 * This exists because `debuggerUrl` — Chrome's own DevTools frontend — is the
 * wrong artifact to embed. It renders the whole inspector (panels, console,
 * toolbar) around a screencast that isn't even the default view, and it pulls
 * megabytes of proxied frontend assets to do it. What an embedder wants is the
 * page and nothing else.
 *
 * Everything is inlined (no bundler, no CDN) so the page is one HTTP response
 * that works behind any CSP the embedder has. It talks the same CDP screencast
 * protocol the dashboard's live view uses: `Page.startScreencast` streams JPEG
 * frames on repaint (idle costs nothing) and `Input.dispatch*` carries clicks
 * and keystrokes back.
 */

function escapeJson(value: unknown): string {
  // The result is interpolated into a <script> body, where `</script>` inside a
  // string literal would terminate the element. Also escape `<!--`, which can
  // open an HTML comment in the same position.
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

export interface LiveViewOptions {
  sessionId: string;
  targetId: string;
  /** Forward mouse/keyboard to the page. When false the stream is watch-only. */
  interactive: boolean;
}

export function liveViewPage({
  sessionId,
  targetId,
  interactive,
}: LiveViewOptions): string {
  const config = escapeJson({ sessionId, targetId, interactive });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Live browser</title>
<style>
  html, body { margin: 0; height: 100%; background: #0b0b0c; overflow: hidden; }
  #stage {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    outline: none;
  }
  #frame {
    max-width: 100%; max-height: 100%;
    width: 100%; height: 100%;
    object-fit: contain;
    opacity: 0; transition: opacity 120ms ease-out;
    -webkit-user-select: none; user-select: none;
  }
  #frame.live { opacity: 1; }
  #stage.readonly #frame { pointer-events: none; }
  #status {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: #8a8a91; font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif;
    letter-spacing: 0.01em; pointer-events: none;
  }
  #status[hidden] { display: none; }
</style>
</head>
<body>
<div id="stage" tabindex="0">
  <img id="frame" alt="Live browser view" draggable="false">
  <div id="status">Connecting…</div>
</div>
<script>
(function () {
  var CONFIG = ${config};
  var stage = document.getElementById("stage");
  var frame = document.getElementById("frame");
  var statusEl = document.getElementById("status");

  if (!CONFIG.interactive) stage.classList.add("readonly");

  var wsScheme = location.protocol === "https:" ? "wss:" : "ws:";
  var wsUrl =
    wsScheme + "//" + location.host +
    "/devtools/page/" + CONFIG.sessionId + "/" + CONFIG.targetId;

  var ws = null;
  var nextId = 1;
  var meta = null;
  var attempt = 0;
  var stopped = false;

  function setStatus(text) {
    if (text) {
      statusEl.textContent = text;
      statusEl.hidden = false;
      frame.classList.remove("live");
    } else {
      statusEl.hidden = true;
      frame.classList.add("live");
    }
  }

  function send(method, params) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ id: nextId++, method: method, params: params || {} }));
  }

  function connect() {
    stopped = false;
    ws = new WebSocket(wsUrl);

    ws.onopen = function () {
      attempt = 0;
      send("Page.enable");
      // Chrome only paints the foreground tab, so a screencast on a background
      // one yields no frames at all — foreground this target before streaming.
      send("Page.bringToFront");
      send("Page.startScreencast", {
        format: "jpeg",
        quality: CONFIG.interactive ? 80 : 60,
        everyNthFrame: CONFIG.interactive ? 1 : 2,
        maxWidth: 1920,
        maxHeight: 1080
      });
    };

    ws.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.method !== "Page.screencastFrame") return;
      meta = msg.params.metadata;
      frame.src = "data:image/jpeg;base64," + msg.params.data;
      setStatus("");
      send("Page.screencastFrameAck", { sessionId: msg.params.sessionId });
    };

    ws.onclose = function () {
      if (stopped) return;
      // The socket drops when the session ends, but also on a transient blip in
      // whatever sits between here and the browser server. Retry a bounded
      // number of times with backoff before calling the session gone, so an
      // embedded view doesn't die permanently on a momentary hiccup.
      if (attempt >= 5) {
        setStatus("Session ended");
        return;
      }
      setStatus("Reconnecting…");
      var delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      attempt++;
      setTimeout(connect, delay);
    };

    ws.onerror = function () { /* onclose handles the retry */ };
  }

  window.addEventListener("pagehide", function () {
    stopped = true;
    send("Page.stopScreencast");
    if (ws) ws.close();
  });

  // --- Input forwarding ---------------------------------------------------

  /**
   * Map a client-space point onto page coordinates. The frame is rendered with
   * object-fit:contain, so the painted area is letterboxed inside the
   * element — the offsets below undo that before scaling into device pixels.
   */
  function toPageCoords(clientX, clientY) {
    if (!meta || !frame.naturalWidth) return null;
    var rect = frame.getBoundingClientRect();
    var natRatio = frame.naturalWidth / frame.naturalHeight;
    var elRatio = rect.width / rect.height;
    var cw = rect.width, ch = rect.height, ox = 0, oy = 0;
    if (natRatio > elRatio) {
      ch = rect.width / natRatio;
      oy = (rect.height - ch) / 2;
    } else {
      cw = rect.height * natRatio;
      ox = (rect.width - cw) / 2;
    }
    var fx = (clientX - rect.left - ox) / cw;
    var fy = (clientY - rect.top - oy) / ch;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return null;
    return { x: fx * meta.deviceWidth, y: fy * meta.deviceHeight };
  }

  // CDP modifier bitmask: Alt=1, Ctrl=2, Meta=4, Shift=8.
  function modifiers(e) {
    return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) |
           (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
  }

  var MOUSE_BUTTONS = ["left", "middle", "right"];

  function mouse(type, e) {
    var pt = toPageCoords(e.clientX, e.clientY);
    if (!pt) return;
    send("Input.dispatchMouseEvent", {
      type: type,
      x: pt.x,
      y: pt.y,
      modifiers: modifiers(e),
      button: type === "mouseMoved" ? "none" : (MOUSE_BUTTONS[e.button] || "left"),
      buttons: e.buttons,
      clickCount: type === "mouseMoved" ? 0 : (e.detail || 1)
    });
  }

  function key(type, e) {
    e.preventDefault();
    var mods = modifiers(e);
    var printable = e.key.length === 1;
    var text = e.key === "Enter" ? "\\r"
      : e.key === "Tab" ? ""
      : (printable && !(mods & 2) && !(mods & 4)) ? e.key
      : "";
    send("Input.dispatchKeyEvent", {
      type: type === "keyUp" ? "keyUp" : (text ? "keyDown" : "rawKeyDown"),
      modifiers: mods,
      key: e.key,
      code: e.code,
      windowsVirtualKeyCode: e.keyCode || 0,
      nativeVirtualKeyCode: e.keyCode || 0,
      autoRepeat: e.repeat,
      location: e.location,
      isKeypad: e.location === 3,
      text: type === "keyDown" ? text : undefined,
      unmodifiedText: type === "keyDown" ? text : undefined
    });
  }

  if (CONFIG.interactive) {
    stage.addEventListener("mousedown", function (e) {
      stage.focus();
      mouse("mousePressed", e);
    });
    stage.addEventListener("mouseup", function (e) { mouse("mouseReleased", e); });
    stage.addEventListener("mousemove", function (e) { mouse("mouseMoved", e); });
    stage.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    stage.addEventListener("wheel", function (e) {
      var pt = toPageCoords(e.clientX, e.clientY);
      if (!pt) return;
      e.preventDefault();
      send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: pt.x,
        y: pt.y,
        modifiers: modifiers(e),
        deltaX: e.deltaX,
        deltaY: e.deltaY
      });
    }, { passive: false });
    stage.addEventListener("keydown", function (e) { key("keyDown", e); });
    stage.addEventListener("keyup", function (e) { key("keyUp", e); });
    stage.focus();
  }

  connect();
})();
</script>
</body>
</html>
`;
}
