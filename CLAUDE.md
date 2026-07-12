# CLAUDE.md

Guidance for working in this repo. Keep changes consistent with the conventions below.

## Monorepo layout

Turborepo + pnpm workspaces.

- `apps/dashboard` — Next.js app (auth + product UI) AND the public browser API.
  Tailwind v4 + shadcn/ui. Route handlers own the browser lifecycle
  (`/browser/start|stop`, `GET /browser`, `GET /browser/:id[/recording]`) and log every
  session to the `browser_session` table, ownership-scoped by `userId`. Auth is in-process
  (better-auth session or `ob_` API token via `lib/api-auth.ts`) — no loopback HTTP. It
  drives `apps/browser-server` over its bypass-token REST surface (`lib/browser-server.ts`,
  raw `node:http` so it can override `Host`); `/metrics` + `/browser/metrics` are thin
  passthroughs. The browser server posts back to secret-gated `/internal/*` callbacks
  (session-ended, boot reconcile) so the DB settles even on crashes/restarts. Returned CDP
  ws URLs point straight at the browser server — clients connect CDP directly, no token.
- `apps/homepage` — marketing site (plain CSS, warm "paper" design system).
- `apps/debug` — internal test pages for the browser server API.
- `apps/browser-server`, `apps/sdk`, `apps/tests` — browser automation server, SDK, e2e tests.
- `apps/backend` — Express gateway skeleton in front of `apps/browser-server` (authenticate
  + proxy). Currently unused by the product path (the dashboard is the API); kept as a
  place to grow a dedicated API service later.
- `packages/ui` (`@repo/ui`) — shared shadcn component library + the Tailwind theme.
- `packages/db` (`@repo/db`) — drizzle schema + client (Postgres). Holds the better-auth
  tables plus `browser_session` (session log; `status` is typed text, not a pg enum).
- `packages/types`, `packages/logger`, `packages/eslint-config`, `packages/typescript-config`.

## Styling conventions

- **Rounding: prefer `rounded`.** Use the plain `rounded` utility for slight, more
  rectangular corners. Avoid `rounded-lg` and `rounded-xl` on components — they read
  too soft for this design. `rounded-md` is fine for small controls; `rounded-full`
  is fine for genuinely circular things (avatars, pills).
- **Colors come from the theme, never hardcode hex.** Use the semantic Tailwind
  tokens (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`,
  `bg-primary`, `border-border`, `ring-ring`, etc.). The palette is the warm
  "paper" system defined once in `packages/ui/src/styles/globals.css` and shared by
  every app that imports `@repo/ui/globals.css`. Change colors there, not per-component.
- **Add UI via shadcn**, into the shared package: from `apps/dashboard`, run
  `pnpm dlx shadcn@latest add <component>` (components land in `@repo/ui`).

## Auth

- better-auth lives in `apps/dashboard/lib/auth.ts` (username + password, drizzle
  adapter, Resend for password-reset email). Client in `lib/auth-client.ts`.
- Gated pages sit under `app/(auth)/` — its server `layout.tsx` checks the session
  and redirects to `/sign-in`. Public auth forms are under `app/(public)/`.
- Auth tables live in `@repo/db`. Never insert users directly — create them through
  better-auth so passwords hash correctly.

## Commands

- `pnpm --filter <pkg> dev | build | check-types | lint`
- `pnpm --filter @repo/db db:generate | db:migrate | seed`
- `scripts/worktree.sh <name> [offset]` — spin up an isolated worktree with its own ports.
