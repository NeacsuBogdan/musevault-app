import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

import { parsePostgresDatabaseUrl } from './src/lib/database-environment';

config({
  path: new URL('./.env.local', import.meta.url),
  quiet: true,
});

const migrationDatabaseUrl = parsePostgresDatabaseUrl(process.env.DATABASE_MIGRATION_URL, 'direct');

if (!migrationDatabaseUrl) {
  throw new Error('Invalid database environment configuration: DATABASE_MIGRATION_URL');
}

export default defineConfig({
  dbCredentials: {
    url: migrationDatabaseUrl,
  },
  dialect: 'postgresql',
  out: './drizzle',
  schema: './src/lib/db/schema/index.ts',
});
