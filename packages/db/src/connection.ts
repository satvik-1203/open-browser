import type { PoolConfig } from "pg";

/**
 * Build a pg connection config from a DATABASE_URL.
 *
 * PlanetScale's URL carries `sslmode=verify-full&sslrootcert=system`. The `pg`
 * connection-string parser treats `sslrootcert` as a file path and tries to
 * read a file literally named "system", which fails. So we parse the URL
 * ourselves and configure TLS explicitly — Node's built-in CA store already
 * trusts PlanetScale's certificate, which is what `sslrootcert=system` asks for.
 */
export function parseConnection(url: string): PoolConfig {
  const u = new URL(url);
  const sslmode = u.searchParams.get("sslmode");

  let ssl: PoolConfig["ssl"] = false;
  if (sslmode && sslmode !== "disable") {
    ssl = {
      rejectUnauthorized: sslmode === "verify-full" || sslmode === "verify-ca",
    };
  }

  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    ssl,
  };
}
