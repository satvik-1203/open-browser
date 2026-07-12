import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { parseConnection } from "./connection";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

export const pool = new Pool(parseConnection(connectionString));

export const db = drizzle(pool, { schema });

export type Database = typeof db;
