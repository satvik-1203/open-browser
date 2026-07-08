# syntax=docker/dockerfile:1.7
#
# Builds and runs apps/server. Uses `turbo prune` so the install layer only
# depends on the lockfile + package.jsons of server and its workspace deps
# (@repo/logger, @repo/types), keeping rebuilds fast when only source changes.
#
# Build:  docker build -t open-browser-server .
# Run:    docker run -p 3001:3001 open-browser-server

FROM node:20-bullseye-slim AS base
RUN corepack enable
ENV PUPPETEER_SKIP_DOWNLOAD=true

# ---- prune: compute the minimal subset of the monorepo needed for `server`
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.10.1 prune server --docker

# ---- install + build
FROM base AS builder
WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=server

RUN pnpm prune --prod

# ---- runtime
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001 \
    HOME=/home/browser \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_NO_SANDBOX=true

# Debian's chromium package pulls in its own matching runtime dependency
# closure via apt, which is more reliable across base-image updates than
# hand-listing the shared libraries Chrome needs. Pinned to bullseye (not
# bookworm): bookworm's chromium (150.x) crashes on launch with SIGTRAP on
# arm64 under some container runtimes; bullseye's build (120.x) is stable.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      dumb-init \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 browsers \
    && useradd --uid 1001 --gid browsers --create-home --shell /usr/sbin/nologin browser

COPY --from=builder --chown=browser:browsers /app .

USER browser
WORKDIR /app/apps/server

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
