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
    PORT=3001 \
    HOME=/home/browser \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Debian's chromium package pulls in its own matching runtime dependency
# closure via apt, which is more reliable across base-image updates than
# hand-listing the shared libraries Chrome needs. Pinned to bullseye (not
# bookworm): bookworm's chromium (150.x) crashes on launch with SIGTRAP on
# arm64 under some container runtimes; bullseye's build (120.x) is stable.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      dumb-init \
      ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 browsers \
    && useradd --uid 1001 --gid browsers --create-home --shell /usr/sbin/nologin browser

COPY --from=builder --chown=browser:browsers /app .

USER browser
WORKDIR /app/apps/browser-server

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
