import path from "node:path";
import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

import { parseConnection } from "./src/connection";

// DATABASE_URL lives in the repo-root .env. When run via `pnpm --filter @repo/db`
// or turbo, cwd is this package dir, so the root is two levels up.
config({ path: path.resolve(process.cwd(), "../../.env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (expected in the repo-root .env)");
}

const conn = parseConnection(process.env.DATABASE_URL);

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    host: conn.host as string,
    port: conn.port as number,
    user: conn.user as string,
    password: conn.password as string,
    database: conn.database as string,
    ssl: conn.ssl as boolean | Record<string, unknown>,
  },
});
