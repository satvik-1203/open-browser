# syntax=docker/dockerfile:1.7
#
# Builds and runs apps/browser-server. Uses `turbo prune` so the install layer
# only depends on the lockfile + package.jsons of browser-server and its
# workspace deps (@repo/logger, @repo/types), keeping rebuilds fast when only
# source changes.
#
# Context must be the repo root (turbo prune reads the whole workspace).
# Build:  docker build -f docker/browser.Dockerfile -t browser-server .
# Run:    docker run -p 3001:3001 browser-server

FROM node:20-bullseye-slim AS base
RUN corepack enable
ENV PUPPETEER_SKIP_DOWNLOAD=true

# ---- prune: compute the minimal subset of the monorepo needed for `browser-server`
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.10.1 prune browser-server --docker

# ---- install + build
FROM base AS builder
WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=browser-server

RUN pnpm prune --prod

# ---- runtime
FROM base AS runner
WORKDIR /app

# NOTE: PUPPETEER_NO_SANDBOX is intentionally NOT set — Chrome's sandbox stays ON.
# startBrowser only passes --no-sandbox when this var is "true", so leaving it
# unset keeps the renderer sandbox active. Chromium here uses the *namespace*
# sandbox (unprivileged user namespaces); there is no setuid chrome-sandbox helper.
#
# No custom seccomp profile is needed OR wanted. Verified on Docker 27.x: under
# Docker's DEFAULT seccomp, renderers land in their own nested user+pid namespace
# with all caps dropped and seccomp-bpf active (Seccomp=2, NoNewPrivs=1). A
# hand-rolled chrome-seccomp.json actually gave *weaker* isolation (seccomp only,
# no namespace nesting), so we deliberately don't ship one.
#
# The only host requirement is that unprivileged user namespaces are permitted
# (default on Docker Desktop and most Linux hosts). If the sandbox fails to init
# — Chrome dies at launch with "No usable sandbox!" — the host is blocking them;
# fix at the host, e.g. on Ubuntu 23.10+/24.04:
#     sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
# Do NOT paper over it with --no-sandbox or --cap-add=SYS_ADMIN.
ENV NODE_ENV=production \
    PORT=8080 \
    HOME=/home/browser \
    PUPPETEER_EXECUTABLE_PATH=/usr/local/bin/ob-chrome

# Debian's chromium package is installed for its dependency closure — apt pulls
# the matching set of shared libraries Chrome needs, which is far more reliable
# than hand-listing them. Pinned to bullseye (not bookworm): bookworm's chromium
# (150.x) crashes on launch with SIGTRAP on arm64 under some container runtimes.
# `xvfb` provides a virtual X display so Chrome can run HEADFUL (headless: false)
# — less bot-detectable — with no physical screen. The server is launched under
# `xvfb-run` below; headless launches ignore the display, so this is harmless
# either way.
#
# But bullseye's chromium is 120.x (Dec 2023), and we do NOT run it when we can
# avoid it. `fingerprint.ts` deliberately derives the advertised UA from the real
# binary, so a 120 build tells every site it is Chrome 120 — Google answers that
# with "This browser version is no longer supported" and expires the login,
# which silently destroys saved contexts no matter how well they round-trip.
# So on amd64 (what Railway builds) we install real, current google-chrome-stable
# from Google's repo and point puppeteer at it. Google ships no arm64 build, so
# local arm64 images fall back to chromium — fine for development, but expect the
# version banner there. `ob-chrome` is the indirection that lets one ENV cover both.
ARG TARGETARCH
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      dumb-init \
      ffmpeg \
      xvfb \
      xauth \
      ca-certificates \
      curl \
      gnupg \
    && if [ "${TARGETARCH:-amd64}" = "amd64" ]; then \
         curl -fsSL https://dl.google.com/linux/linux_signing_key.pub \
           | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
         && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
           > /etc/apt/sources.list.d/google-chrome.list \
         && apt-get update \
         && apt-get install -y --no-install-recommends google-chrome-stable \
         && ln -sf /usr/bin/google-chrome-stable /usr/local/bin/ob-chrome; \
       else \
         ln -sf /usr/bin/chromium /usr/local/bin/ob-chrome; \
       fi \
    && "/usr/local/bin/ob-chrome" --version \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 browsers \
    && useradd --uid 1001 --gid browsers --create-home --shell /usr/sbin/nologin browser

# Entrypoint guarantees an X display for headful Chrome regardless of the
# command run — so overriding CMD (e.g. a Railway "Custom Start Command") can't
# silently drop xvfb-run and break `POST /browser/start`.
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 0755 /usr/local/bin/entrypoint.sh

COPY --from=builder --chown=browser:browsers /app .

USER browser
WORKDIR /app/apps/browser-server

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# dumb-init reaps zombies / forwards signals as PID 1; entrypoint.sh then wraps
# the command in a virtual X display (see entrypoint.sh). Because the Xvfb wrap
# lives in ENTRYPOINT — which platform start-command overrides preserve — a
# custom CMD like `node dist/index.js` still gets a DISPLAY.
ENTRYPOINT ["dumb-init", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/index.js"]
