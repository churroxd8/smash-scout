import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not defined in environment variables");
}

/**
 * Postgres client for Neon
 * `prepare: false` is required for compatibility with Neon's pooler.
 */
const client = postgres(process.env.DATABASE_URL, {
    prepare: false,
});

export const db = drizzle(client, { schema });

export type Database = typeof db;