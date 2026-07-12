# CLAUDE.md

Guidance for working in this repo. Keep changes consistent with the conventions below.

## Monorepo layout

Turborepo + pnpm workspaces.

- `apps/dashboard` — Next.js app (auth + product UI). Tailwind v4 + shadcn/ui.
- `apps/homepage` — marketing site (plain CSS, warm "paper" design system).
- `apps/debug` — internal test pages for the browser server API.
- `apps/browser-server`, `apps/sdk`, `apps/tests` — browser automation server, SDK, e2e tests.
- `apps/backend` — Express API gateway in front of `apps/browser-server`: authenticates
  callers (API token or forwarded user session → `req.userId`) and proxies the REST surface.
- `packages/ui` (`@repo/ui`) — shared shadcn component library + the Tailwind theme.
- `packages/db` (`@repo/db`) — drizzle schema + client (Postgres). Holds the better-auth tables.
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
