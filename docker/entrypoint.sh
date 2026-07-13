#!/bin/sh
# Ensure a virtual X display exists for headful Chrome before running whatever
# command was passed — the Dockerfile CMD *or* a platform override (e.g.
# Railway's "Custom Start Command", which replaces CMD but keeps ENTRYPOINT).
# startBrowser launches Chrome headful by default and needs a DISPLAY; wrapping
# here means the server can't be started without one by accident.
#
# If a DISPLAY is already provided (someone wired up their own X server, or a
# caller opted into headless), don't double-wrap — just exec the command.
set -eu

if [ -n "${DISPLAY:-}" ]; then
  exec "$@"
fi

# --auto-servernum picks a free display and shares one Xvfb across every Chrome
# instance this server spawns (not one per session).
exec xvfb-run --auto-servernum \
  --server-args="-screen 0 1920x1080x24 -nolisten tcp" \
  "$@"
