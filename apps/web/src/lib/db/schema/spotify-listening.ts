import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { users } from './users';
import { spotifyArtists, spotifyTracks } from './spotify-library';

export const spotifyListeningSyncs = pgTable(
  'spotify_listening_syncs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').default('running').notNull(),
    syncMode: text('sync_mode').notNull(),
    processedPlayCount: integer('processed_play_count').default(0).notNull(),
    processedPageCount: integer('processed_page_count').default(0).notNull(),
    cursorBefore: bigint('cursor_before', { mode: 'number' }),
    cursorAfter: bigint('cursor_after', { mode: 'number' }),
    startedAt: timestamp('started_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    failureCode: text('failure_code'),
    resultCode: text('result_code'),
  },
  (table) => [
    check(
      'spotify_listening_syncs_status_valid',
      sql`${table.status} in ('running', 'completed', 'failed')`,
    ),
    check(
      'spotify_listening_syncs_mode_valid',
      sql`${table.syncMode} in ('initial', 'incremental')`,
    ),
    check('spotify_listening_syncs_play_count_non_negative', sql`${table.processedPlayCount} >= 0`),
    check('spotify_listening_syncs_page_count_non_negative', sql`${table.processedPageCount} >= 0`),
    uniqueIndex('spotify_listening_syncs_one_running_per_user')
      .on(table.userId)
      .where(sql`${table.status} = 'running'`),
    index('spotify_listening_syncs_user_started_idx').on(table.userId, table.startedAt),
  ],
);

export const spotifyPlayHistory = pgTable(
  'spotify_play_history',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    trackId: text('track_id')
      .notNull()
      .references(() => spotifyTracks.id),
    playedAt: timestamp('played_at', { mode: 'date', withTimezone: true }).notNull(),
    contextType: text('context_type'),
    contextUri: text('context_uri'),
    contextSpotifyUrl: text('context_spotify_url'),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.playedAt, table.trackId] }),
    index('spotify_play_history_user_played_at_idx').on(table.userId, table.playedAt),
    index('spotify_play_history_user_track_idx').on(table.userId, table.trackId),
  ],
);

export const spotifyTopItemSnapshots = pgTable(
  'spotify_top_item_snapshots',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    snapshotDate: date('snapshot_date', { mode: 'string' }).notNull(),
    capturedAt: timestamp('captured_at', { mode: 'date', withTimezone: true })
      .defaultNow()
      .notNull(),
    timeRange: text('time_range').notNull(),
  },
  (table) => [
    uniqueIndex('spotify_top_item_snapshots_user_date_range_unique').on(
      table.userId,
      table.snapshotDate,
      table.timeRange,
    ),
    check(
      'spotify_top_item_snapshots_range_valid',
      sql`${table.timeRange} in ('short_term', 'medium_term', 'long_term')`,
    ),
    index('spotify_top_item_snapshots_user_captured_idx').on(table.userId, table.capturedAt),
  ],
);

export const spotifyTopTrackSnapshotItems = pgTable(
  'spotify_top_track_snapshot_items',
  {
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => spotifyTopItemSnapshots.id, { onDelete: 'cascade' }),
    trackId: text('track_id')
      .notNull()
      .references(() => spotifyTracks.id),
    rank: integer('rank').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.trackId] }),
    uniqueIndex('spotify_top_track_snapshot_rank_unique').on(table.snapshotId, table.rank),
    check('spotify_top_track_snapshot_rank_positive', sql`${table.rank} > 0`),
  ],
);

export const spotifyTopArtistSnapshotItems = pgTable(
  'spotify_top_artist_snapshot_items',
  {
    snapshotId: uuid('snapshot_id')
      .notNull()
      .references(() => spotifyTopItemSnapshots.id, { onDelete: 'cascade' }),
    artistId: text('artist_id')
      .notNull()
      .references(() => spotifyArtists.id),
    rank: integer('rank').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.artistId] }),
    uniqueIndex('spotify_top_artist_snapshot_rank_unique').on(table.snapshotId, table.rank),
    check('spotify_top_artist_snapshot_rank_positive', sql`${table.rank} > 0`),
  ],
);
