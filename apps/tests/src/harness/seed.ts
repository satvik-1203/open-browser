import { mintApiToken } from "@repo/db";

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
 * row directly, then mint an `ob_…` key straight into the DB via the shared
 * `mintApiToken` helper — the same code path the dashboard's create-token action
 * uses, minus the session/password. This is valid because every e2e test
 * authenticates with the API token, never a password, so no better-auth
 * `account`/hashed-password row is needed.
 *
 * The token is a random secret; only its hash is stored, and the dashboard/
 * backend look it up by that hash — no shared encryption key is involved.
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

  const { token } = await mintApiToken(db, {
    userId: user.id,
    name: "e2e-key",
  });
  return { userId: user.id, token };
}
