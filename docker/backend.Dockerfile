# syntax=docker/dockerfile:1.7
#
# Builds and runs apps/backend — the API gateway in front of browser-server.
# Uses `turbo prune` so the install layer only depends on the lockfile +
# package.jsons of backend and its workspace deps (@repo/logger, @repo/db,
# @repo/crypto), keeping rebuilds fast when only source changes.
#
# Context must be the repo root (turbo prune reads the whole workspace).
# Build:  docker build -f docker/backend.Dockerfile -t backend .
# Run:    docker run -p 3002:3002 --env-file apps/backend/.env backend
#
# Required runtime env (pass via -e / --env-file / compose, NOT baked into the
# image — .env* is dockerignored):
#   DATABASE_URL, API_TOKEN_ENCRYPTION_KEY, BROWSER_SERVER_URL,
#   BROWSER_SERVER_BYPASS_TOKEN, BROWSER_SERVER_PUBLIC_URL, AUTH_SERVER_URL

FROM node:20-bullseye-slim AS base
RUN corepack enable

# ---- prune: compute the minimal subset of the monorepo needed for `backend`
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.10.1 prune backend --docker

# ---- install + build
FROM base AS builder
WORKDIR /app

COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .
RUN pnpm turbo run build --filter=backend

RUN pnpm prune --prod

# ---- runtime
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3002

# dumb-init as PID 1 so SIGTERM/SIGINT reach Node and the graceful shutdown
# handlers (closing the HTTP server) actually run.
RUN apt-get update && apt-get install -y --no-install-recommends \
      dumb-init \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --gid 1001 nodejs \
    && useradd --uid 1001 --gid nodejs --create-home --shell /usr/sbin/nologin backend

COPY --from=builder --chown=backend:nodejs /app .

USER backend
WORKDIR /app/apps/backend

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3002)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
