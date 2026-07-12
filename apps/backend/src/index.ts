import { config } from "dotenv";

// Load env BEFORE anything that reads it. `@repo/db` throws at import time if
// DATABASE_URL is missing, and static imports evaluate before any body code —
// so the real app (`./server`, which imports @repo/db) is pulled in via a
// dynamic import that runs only after env is populated here.
//
// `.env` holds secrets; `.env.local` overrides it (worktrees write an offset
// `.env.local`). Mirrors Next.js's `.env` < `.env.local` precedence.
config();
config({ path: ".env.local", override: true });

import("./server").catch((error) => {
  console.error(error);
  process.exit(1);
});
