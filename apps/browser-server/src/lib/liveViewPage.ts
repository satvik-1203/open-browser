/**
 * The embeddable live view: a single self-contained HTML page showing a
 * session's browser — tab strip, URL bar, and the page itself — for dropping
 * into a customer's `<iframe>`.
 *
 * This exists because `debuggerUrl` — Chrome's own DevTools frontend — is the
 * wrong artifact to embed. It renders the whole inspector (panels, console,
 * network) around a screencast that isn't even its default view, and it pulls
 * megabytes of proxied frontend assets to do it. What an embedder wants is a
 * browser, not a debugger.
 *
 * Everything is inlined (no bundler, no CDN) so the page is one HTTP response
 * that works behind any CSP the embedder has. It is the vanilla-JS twin of the
 * dashboard's `BrowserLiveView` + `BrowserTabStrip` + `useBrowserTabs`, and it
 * holds the same two sockets they do:
 *
 *   - a *page* socket for the viewport: `Page.startScreencast` streams JPEG
 *     frames on repaint (idle costs nothing), `Input.dispatch*` carries clicks
 *     and keystrokes back.
 *   - a *browser* socket for the tab strip: a page target can't see its
 *     siblings, so target discovery needs its own connection.
 *
 * The chrome is styled from the same warm "paper" palette as the dashboard,
 * copied rather than imported — this page can't pull in `@repo/ui`. Keep the
 * values below in sync with `packages/ui/src/styles/globals.css` if the theme
 * moves.
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
  /**
   * Render the tab strip and URL bar. Off gives a bare viewport — for an
   * embedder who has built their own controls around the iframe, and the only
   * option when the view is read-only (controls you can't use are furniture).
   */
  chrome: boolean;
}

export function liveViewPage({
  sessionId,
  targetId,
  interactive,
  chrome,
}: LiveViewOptions): string {
  const config = escapeJson({ sessionId, targetId, interactive, chrome });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Live browser</title>
<style>
  :root {
    --background: #f4efe4;
    --foreground: #221e17;
    --card: #fbf8f1;
    --muted: #efe9db;
    --muted-foreground: #6b6357;
    --border: rgba(45, 38, 26, 0.14);
    --ring: #2f6fe0;
    --radius: 0.375rem;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --background: #1c1813;
      --foreground: #ece6da;
      --card: #241f18;
      --muted: #2c261d;
      --muted-foreground: #a89e8d;
      --border: rgba(236, 230, 218, 0.12);
      --ring: #4f86e8;
    }
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; overflow: hidden; }
  body {
    background: var(--background);
    color: var(--foreground);
    font: 13px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  #shell { display: flex; flex-direction: column; height: 100%; }

  /* --- Tab strip ------------------------------------------------------- */
  #tabs {
    display: flex; align-items: stretch; gap: 2px;
    padding: 4px 4px 0; overflow-x: auto;
    background: var(--muted);
    border-bottom: 1px solid var(--border);
    scrollbar-width: thin;
  }
  #tabs:empty { display: none; }
  .tab {
    display: flex; align-items: center; gap: 6px;
    min-width: 0; max-width: 12rem; flex: 1 1 0;
    padding: 6px 10px;
    font-size: 12px; color: var(--muted-foreground);
    border: 1px solid transparent; border-bottom: none;
    border-radius: var(--radius) var(--radius) 0 0;
    cursor: pointer; user-select: none;
    transition: background-color 120ms, color 120ms;
  }
  .tab:hover { background: color-mix(in srgb, var(--card) 60%, transparent); }
  .tab[aria-selected="true"] {
    background: var(--card); color: var(--foreground); border-color: var(--border);
  }
  .tab-label {
    min-width: 0; flex: 1;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .tab-close {
    flex-shrink: 0; padding: 1px; border: 0; border-radius: 3px;
    background: transparent; color: inherit; cursor: pointer;
    opacity: 0; line-height: 0;
  }
  .tab:hover .tab-close, .tab[aria-selected="true"] .tab-close { opacity: 0.6; }
  .tab-close:hover { background: color-mix(in srgb, var(--muted-foreground) 20%, transparent); }
  #new-tab {
    flex-shrink: 0; margin: 2px 0; padding: 0 9px;
    border: 0; border-radius: 3px; background: transparent;
    color: var(--muted-foreground); cursor: pointer; line-height: 0;
  }
  #new-tab:hover { background: color-mix(in srgb, var(--card) 60%, transparent); color: var(--foreground); }

  /* --- URL bar --------------------------------------------------------- */
  #bar {
    display: flex; align-items: center; gap: 4px;
    padding: 6px 8px;
    background: var(--card);
    border-bottom: 1px solid var(--border);
  }
  #bar button {
    flex-shrink: 0; width: 26px; height: 26px; padding: 0;
    display: inline-flex; align-items: center; justify-content: center;
    border: 0; border-radius: var(--radius);
    background: transparent; color: var(--muted-foreground); cursor: pointer;
  }
  #bar button:hover:not(:disabled) { background: var(--muted); color: var(--foreground); }
  #bar button:disabled { opacity: 0.4; cursor: default; }
  #address {
    flex: 1; min-width: 0; height: 28px;
    padding: 0 10px;
    font: inherit; font-size: 12px; color: var(--foreground);
    background: var(--background);
    border: 1px solid var(--border); border-radius: var(--radius);
    outline: none;
  }
  #address:focus { border-color: var(--ring); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ring) 30%, transparent); }

  /* --- Viewport -------------------------------------------------------- */
  #stage {
    position: relative; flex: 1; min-height: 0;
    display: flex; align-items: center; justify-content: center;
    background: #0b0b0c; outline: none;
  }
  #frame {
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
    color: #8a8a91; font-size: 12px; letter-spacing: 0.01em;
    pointer-events: none;
  }
  #status[hidden] { display: none; }
</style>
</head>
<body>
<div id="shell">
  <div id="tabs" role="tablist"></div>
  <div id="bar">
    <button id="back" type="button" aria-label="Back" title="Back">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
    </button>
    <button id="forward" type="button" aria-label="Forward" title="Forward">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
    </button>
    <button id="reload" type="button" aria-label="Reload" title="Reload">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
    </button>
    <form id="address-form" style="display:contents">
      <input id="address" type="text" spellcheck="false" autocomplete="off" placeholder="Enter a URL" aria-label="Address">
    </form>
  </div>
  <div id="stage" tabindex="0">
    <img id="frame" alt="Live browser view" draggable="false">
    <div id="status">Connecting…</div>
  </div>
</div>
<script>
(function () {
  var CONFIG = ${config};

  var shell = document.getElementById("shell");
  var tabsEl = document.getElementById("tabs");
  var barEl = document.getElementById("bar");
  var addressEl = document.getElementById("address");
  var stage = document.getElementById("stage");
  var frame = document.getElementById("frame");
  var statusEl = document.getElementById("status");

  if (!CONFIG.interactive) stage.classList.add("readonly");
  if (!CONFIG.chrome) {
    tabsEl.remove();
    barEl.remove();
  }

  var wsScheme = location.protocol === "https:" ? "wss:" : "ws:";
  var wsOrigin = wsScheme + "//" + location.host;
  var browserWsUrl = wsOrigin + "/devtools/browser/" + CONFIG.sessionId;
  function pageWsUrl(targetId) {
    return wsOrigin + "/devtools/page/" + CONFIG.sessionId + "/" + targetId;
  }

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

  /**
   * Minimal CDP client: JSON-RPC framing over one socket. \`send\` resolves with
   * the command result; \`on\` subscribes to events.
   */
  function Cdp(url) {
    var self = this;
    this.closed = false;
    this.nextId = 1;
    this.pending = {};
    this.listeners = {};
    this.ws = new WebSocket(url);
    this.opened = new Promise(function (resolve, reject) {
      self.ws.addEventListener("open", function () { resolve(); }, { once: true });
      self.ws.addEventListener("error", function () { reject(new Error("socket error")); }, { once: true });
    });
    this.ws.addEventListener("message", function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (typeof msg.id === "number" && self.pending[msg.id]) {
        var p = self.pending[msg.id];
        delete self.pending[msg.id];
        if (msg.error) p.reject(new Error(msg.error.message || "CDP error"));
        else p.resolve(msg.result);
      } else if (msg.method && self.listeners[msg.method]) {
        self.listeners[msg.method].forEach(function (cb) { cb(msg.params); });
      }
    });
  }
  Cdp.prototype.ready = function () { return this.opened; };
  Cdp.prototype.send = function (method, params) {
    var self = this;
    return new Promise(function (resolve, reject) {
      if (self.closed || self.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("socket not open"));
        return;
      }
      var id = self.nextId++;
      self.pending[id] = { resolve: resolve, reject: reject };
      self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    });
  };
  /** Fire-and-forget, for high-frequency input that must never reject. */
  Cdp.prototype.notify = function (method, params) {
    if (this.closed || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ id: this.nextId++, method: method, params: params || {} }));
  };
  Cdp.prototype.on = function (method, cb) {
    (this.listeners[method] = this.listeners[method] || []).push(cb);
  };
  Cdp.prototype.close = function () {
    this.closed = true;
    this.pending = {};
    try { this.ws.close(); } catch (e) { /* already closing */ }
  };

  // --- Viewport: one page socket at a time --------------------------------

  var page = null;          // Cdp on the active page target
  var activeTargetId = CONFIG.targetId;
  var meta = null;          // latest screencast frame metadata
  var attempt = 0;          // consecutive reconnects for the current target
  var editing = false;      // user is typing in the address bar
  var teardown = false;     // page is unloading; stop reconnecting

  function attachPage(targetId, isRetry) {
    if (page) {
      page.notify("Page.stopScreencast");
      page.close();
      page = null;
    }
    activeTargetId = targetId;
    if (!isRetry) attempt = 0;
    meta = null;
    setStatus(isRetry ? "Reconnecting…" : "Connecting…");

    var conn = new Cdp(pageWsUrl(targetId));
    page = conn;

    conn.on("Page.screencastFrame", function (p) {
      if (page !== conn) return;
      attempt = 0;
      meta = p.metadata;
      frame.src = "data:image/jpeg;base64," + p.data;
      setStatus("");
      conn.notify("Page.screencastFrameAck", { sessionId: p.sessionId });
    });

    // Keep the address bar in step with the page's own navigation, unless the
    // user is mid-edit — clobbering what someone is typing is maddening.
    conn.on("Page.frameNavigated", function (p) {
      if (page !== conn || !p.frame || p.frame.parentId || editing) return;
      addressEl.value = p.frame.url || "";
    });

    conn.ws.addEventListener("close", function () {
      if (teardown || page !== conn) return;
      // The socket drops when the session ends, but also on a transient blip
      // between here and the browser server. Retry a bounded number of times
      // before calling it gone, so an embed doesn't die on a hiccup.
      if (attempt >= 5) {
        setStatus("Session ended");
        return;
      }
      var delay = Math.min(1000 * Math.pow(2, attempt), 8000);
      attempt++;
      setTimeout(function () {
        if (!teardown && page === conn) attachPage(targetId, true);
      }, delay);
    });

    conn.ready().then(function () {
      if (page !== conn) return;
      conn.notify("Page.enable");
      // Chrome only paints the foreground tab, so a screencast on a background
      // one yields no frames at all. Foreground this target before streaming,
      // otherwise switching to an idle tab connects and then shows nothing.
      conn.notify("Page.bringToFront");
      conn.notify("Page.startScreencast", {
        format: "jpeg",
        quality: CONFIG.interactive ? 80 : 60,
        everyNthFrame: CONFIG.interactive ? 1 : 2,
        maxWidth: 1920,
        maxHeight: 1080
      });
      if (CONFIG.chrome) {
        conn.send("Page.getNavigationHistory").then(function (hist) {
          if (page !== conn || editing) return;
          var entry = hist.entries[hist.currentIndex];
          addressEl.value = entry ? entry.url : "";
        }).catch(function () { /* the bar just starts empty */ });
      }
    }).catch(function () {
      if (page === conn) setStatus("Live view unavailable");
    });
  }

  // --- Tab strip ----------------------------------------------------------

  var browserConn = null;
  var tabs = [];

  /** A short, recognizable label for a tab: its title, else its host. */
  function tabLabel(tab) {
    var title = (tab.title || "").trim();
    if (title) return title;
    try {
      var u = new URL(tab.url);
      // about:blank and friends have no host — show the scheme-y thing itself,
      // which is what Chrome does for a fresh tab.
      return u.hostname || tab.url || u.protocol;
    } catch (e) {
      return tab.url || "New tab";
    }
  }

  var CLOSE_SVG = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  var PLUS_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>';

  function renderTabs() {
    if (!CONFIG.chrome) return;
    tabsEl.textContent = "";
    // Nothing discovered yet (still connecting, or discovery failed) — render
    // nothing rather than an empty strip.
    if (tabs.length === 0) return;

    tabs.forEach(function (tab) {
      var el = document.createElement("div");
      el.className = "tab";
      el.setAttribute("role", "tab");
      el.setAttribute("aria-selected", String(tab.targetId === activeTargetId));
      el.title = tab.url || "";
      el.tabIndex = 0;

      var label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = tabLabel(tab);
      el.appendChild(label);

      // Chrome keeps the last tab closable (it exits); here closing it would
      // strand the live view, so the control is withheld.
      if (tabs.length > 1 && CONFIG.interactive) {
        var close = document.createElement("button");
        close.className = "tab-close";
        close.type = "button";
        close.setAttribute("aria-label", "Close " + tabLabel(tab));
        close.innerHTML = CLOSE_SVG;
        close.addEventListener("click", function (e) {
          // Don't let the click select the tab on its way out.
          e.stopPropagation();
          closeTab(tab.targetId);
        });
        el.appendChild(close);
      }

      function pick() { selectTab(tab.targetId); }
      el.addEventListener("click", pick);
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); }
      });
      tabsEl.appendChild(el);
    });

    if (CONFIG.interactive) {
      var plus = document.createElement("button");
      plus.id = "new-tab";
      plus.type = "button";
      plus.setAttribute("aria-label", "New tab");
      plus.innerHTML = PLUS_SVG;
      plus.addEventListener("click", createTab);
      tabsEl.appendChild(plus);
    }
  }

  function selectTab(targetId) {
    if (targetId === activeTargetId) return;
    // Chrome only paints the foreground tab, so activating it is what makes
    // switching actually show anything.
    if (browserConn) {
      browserConn.send("Target.activateTarget", { targetId: targetId }).catch(function () {});
    }
    addressEl.value = "";
    attachPage(targetId, false);
    renderTabs();
  }

  function createTab() {
    if (!browserConn) return;
    browserConn.send("Target.createTarget", { url: "about:blank" })
      .then(function (r) { selectTab(r.targetId); })
      .catch(function () {});
  }

  function closeTab(targetId) {
    // The list updates from the resulting Target.targetDestroyed event, so
    // there's nothing to prune here.
    if (browserConn) {
      browserConn.send("Target.closeTarget", { targetId: targetId }).catch(function () {});
    }
  }

  function watchTabs() {
    var conn = new Cdp(browserWsUrl);
    browserConn = conn;

    // Only real tabs. Target discovery also reports iframes, workers and the
    // browser itself, none of which a user can switch to.
    function isTab(t) { return t.type === "page"; }

    function upsert(target) {
      if (!isTab(target)) return;
      var at = -1;
      for (var i = 0; i < tabs.length; i++) {
        if (tabs[i].targetId === target.targetId) { at = i; break; }
      }
      if (at === -1) tabs.push(target);
      else tabs[at] = target;
      renderTabs();
    }

    conn.on("Target.targetCreated", function (p) { upsert(p.targetInfo); });
    // Fires on title/URL changes too, which is what keeps a tab's label current
    // as the page navigates.
    conn.on("Target.targetInfoChanged", function (p) { upsert(p.targetInfo); });
    conn.on("Target.targetDestroyed", function (p) {
      tabs = tabs.filter(function (t) { return t.targetId !== p.targetId; });
      // If the tab being viewed just closed, adopt whatever is left rather than
      // leaving the view pointed at a dead socket.
      if (p.targetId === activeTargetId && tabs.length > 0) {
        selectTab(tabs[0].targetId);
      } else {
        renderTabs();
      }
    });

    conn.ready().then(function () {
      return conn.send("Target.getTargets");
    }).then(function (r) {
      tabs = r.targetInfos.filter(isTab);
      renderTabs();
      // Subscribe only after the initial list, so the two can't interleave into
      // a duplicated entry.
      return conn.send("Target.setDiscoverTargets", { discover: true });
    }).catch(function () {
      // Non-fatal: the viewport still works on its own target, there's just no
      // tab strip.
    });
  }

  // --- Navigation ---------------------------------------------------------

  function navigate(raw) {
    var url = (raw || "").trim();
    if (!url || !page) return;
    if (!/^[a-z]+:\\/\\//i.test(url)) url = "https://" + url;
    page.send("Page.navigate", { url: url }).catch(function () {});
  }

  if (CONFIG.chrome) {
    document.getElementById("address-form").addEventListener("submit", function (e) {
      e.preventDefault();
      navigate(addressEl.value);
      editing = false;
      addressEl.blur();
      stage.focus();
    });
    // Select the whole URL when the bar is first clicked, the way a real
    // address bar does — so typing replaces it rather than appending. The
    // mouseup guard is the point: focus-time select() alone gets undone a
    // moment later when the click places its caret.
    var selectOnClick = false;
    addressEl.addEventListener("focus", function () {
      editing = true;
      selectOnClick = true;
      addressEl.select();
    });
    addressEl.addEventListener("mouseup", function (e) {
      if (!selectOnClick) return;
      selectOnClick = false;
      e.preventDefault();
      addressEl.select();
    });
    addressEl.addEventListener("blur", function () {
      editing = false;
      selectOnClick = false;
    });
    // The address bar owns its own keystrokes — without this they'd also be
    // forwarded to the page, typing into whatever has focus over there.
    addressEl.addEventListener("keydown", function (e) { e.stopPropagation(); });
    addressEl.addEventListener("keyup", function (e) { e.stopPropagation(); });

    document.getElementById("back").addEventListener("click", function () {
      if (page) page.send("Runtime.evaluate", { expression: "history.back()" }).catch(function () {});
    });
    document.getElementById("forward").addEventListener("click", function () {
      if (page) page.send("Runtime.evaluate", { expression: "history.forward()" }).catch(function () {});
    });
    document.getElementById("reload").addEventListener("click", function () {
      if (page) page.send("Page.reload", {}).catch(function () {});
    });

    // Read-only embeds get the strip and address as *information*, not controls.
    if (!CONFIG.interactive) {
      addressEl.readOnly = true;
      ["back", "forward", "reload"].forEach(function (id) {
        document.getElementById(id).disabled = true;
      });
    }
  }

  window.addEventListener("pagehide", function () {
    teardown = true;
    if (page) { page.notify("Page.stopScreencast"); page.close(); }
    if (browserConn) browserConn.close();
  });

  // --- Input forwarding ---------------------------------------------------

  /**
   * Map a client-space point onto page coordinates. The frame is rendered with
   * object-fit:contain, so the painted area is letterboxed inside the element —
   * the offsets below undo that before scaling into device pixels.
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
    if (!pt || !page) return;
    page.notify("Input.dispatchMouseEvent", {
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
    if (!page) return;
    e.preventDefault();
    var mods = modifiers(e);
    var printable = e.key.length === 1;
    var text = e.key === "Enter" ? "\\r"
      : e.key === "Tab" ? ""
      : (printable && !(mods & 2) && !(mods & 4)) ? e.key
      : "";
    page.notify("Input.dispatchKeyEvent", {
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
      if (!pt || !page) return;
      e.preventDefault();
      page.notify("Input.dispatchMouseEvent", {
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

  attachPage(CONFIG.targetId, false);
  if (CONFIG.chrome) watchTabs();
})();
</script>
</body>
</html>
`;
}
