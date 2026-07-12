import path from "node:path";
import { config } from "dotenv";

// Load the repo-root .env (DATABASE_URL) before importing the db client.
config({ path: path.resolve(process.cwd(), "../../.env") });

async function seed() {
  // Import lazily so env is loaded before the pool is created.
  const { pool } = await import("./client");

  console.log("Seeding database…");

  // No seed data for now.
  //
  // NOTE: auth users must be created THROUGH better-auth so passwords are
  // hashed correctly — do NOT insert into the `user`/`account` tables directly.
  // To seed users later, call the better-auth server API, e.g.:
  //
  //   import { auth } from "../../../apps/dashboard/lib/auth";
  //   await auth.api.signUpEmail({
  //     body: { username, email, password, name },
  //   });
  //
  // (or hit the running dashboard's /api/auth/sign-up/email endpoint).

  console.log("Nothing to seed. Done.");
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
