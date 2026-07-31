import 'server-only';

import { Pool } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';

import { getDatabaseUrl } from '@/lib/env';

import * as schema from './schema';

export type Database = NeonDatabase<typeof schema>;

const DATABASE_CONNECTION_TIMEOUT_MILLISECONDS = 10_000;

/**
 * Runs one database operation with a request-local Neon WebSocket pool.
 *
 * Pool construction and environment access stay behind this function so imports,
 * builds, and unit tests do not establish a database connection.
 */
export async function withDatabase<T>(operation: (database: Database) => Promise<T>): Promise<T> {
  const pool = new Pool({
    connectionString: getDatabaseUrl(),
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MILLISECONDS,
  });
  const database = drizzle({ client: pool, schema });

  try {
    return await operation(database);
  } finally {
    await pool.end();
  }
}
