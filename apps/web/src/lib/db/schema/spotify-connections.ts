import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

export const spotifyConnections = pgTable(
  'spotify_connections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    encryptedRefreshToken: text('encrypted_refresh_token').notNull(),
    tokenEncryptionVersion: integer('token_encryption_version').default(1).notNull(),
    scopes: text('scopes').array().notNull(),
    connectedAt: timestamp('connected_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    lastSuccessfulSyncAt: timestamp('last_successful_sync_at', {
      mode: 'date',
      withTimezone: true,
    }),
  },
  (table) => [
    check(
      'spotify_connections_token_encryption_version_positive',
      sql`${table.tokenEncryptionVersion} > 0`,
    ),
  ],
);
