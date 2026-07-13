import { encryptToken } from "@repo/crypto";

import { TEST_USER } from "./config";
import { schema, type TestDb } from "./db";

export interface SeededUser {
  userId: string;
  /** A ready-to-use `ob_…` API token for this user. */
  token: string;
}

export interface SeedOverrides {
  id?: string;
  name?: string;
  email?: string;
  username?: string;
}

/**
 * Seed a user and mint an API token WITHOUT any login flow: insert the `user`
 * row directly and encrypt an `api_token` row into an `ob_…` key — the same
 * thing `POST /api/tokens` does internally, minus the session/password. This is
 * valid because every e2e test authenticates with the API token, never a
 * password, so no better-auth `account`/hashed-password row is needed.
 *
 * Requires `API_TOKEN_ENCRYPTION_KEY` to be set in this process (the harness
 * sets it to the same value the dashboard child uses, so tokens round-trip).
 */
export async function seedUserWithToken(
  db: TestDb,
  overrides: SeedOverrides = {},
): Promise<SeededUser> {
  const user = { ...TEST_USER, ...overrides };

  await db
    .insert(schema.user)
    .values({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      emailVerified: true,
    })
    .onConflictDoNothing();

  const [row] = await db
    .insert(schema.apiToken)
    .values({ userId: user.id, name: "e2e-key" })
    .returning();
  if (!row) throw new Error("failed to insert api token row");

  const token = encryptToken({ userId: user.id, tokenId: row.id });
  return { userId: user.id, token };
}
