import { generateApiToken } from "@repo/crypto";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "./schema";

/** Any drizzle client over our schema — the app's `db` or the tests' `TestDb`. */
type Db = NodePgDatabase<typeof schema>;

export interface MintedApiToken {
  id: string;
  name: string;
  createdAt: Date;
  /**
   * The raw `ob_…` token. Returned exactly once — only its hash is stored, so it
   * can't be recovered afterwards.
   */
  token: string;
}

/**
 * Mint an API token: generate a random `ob_…` secret, store its hash on a new
 * `api_token` row, and return the raw token once. This is the single source of
 * truth for minting tokens: the dashboard's create-token action calls it, and
 * the e2e harness calls it to seed a token straight into the DB (no login flow).
 * Pass whichever drizzle client you hold.
 */
export async function mintApiToken(
  db: Db,
  { userId, name }: { userId: string; name: string },
): Promise<MintedApiToken> {
  const { token, hash } = generateApiToken();
  const [row] = await db
    .insert(schema.apiToken)
    .values({ userId, name, tokenHash: hash })
    .returning();
  if (!row) throw new Error("failed to insert api_token row");

  return { id: row.id, name: row.name, createdAt: row.createdAt, token };
}
