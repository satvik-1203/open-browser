import * as schema from "@repo/db/schema";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { MIGRATIONS_DIR, POSTGRES } from "./config";

export { schema };
export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

/** Apply all drizzle migrations (auth tables + api_token + browser_session). */
export async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: POSTGRES.url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await pool.end();
  }
}

/** A drizzle client the tests use to assert on rows directly. */
export function connectTestDb(): { db: TestDb; close: () => Promise<void> } {
  const pool = new Pool({ connectionString: POSTGRES.url });
  const db = drizzle(pool, { schema });
  return { db, close: () => pool.end() };
}
