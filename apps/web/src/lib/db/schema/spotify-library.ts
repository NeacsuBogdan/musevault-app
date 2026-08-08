import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
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

const timestamps = {
  createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
};

export const spotifyArtists = pgTable('spotify_artists', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ...timestamps,
});

export const spotifyAlbums = pgTable('spotify_albums', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  imageUrl: text('image_url'),
  ...timestamps,
});

export const spotifyTracks = pgTable(
  'spotify_tracks',
  {
    id: text('id').primaryKey(),
    albumId: text('album_id')
      .notNull()
      .references(() => spotifyAlbums.id),
    name: text('name').notNull(),
    spotifyUrl: text('spotify_url').notNull(),
    durationMs: integer('duration_ms').notNull(),
    explicit: boolean('explicit').notNull(),
    ...timestamps,
  },
  (table) => [
    check('spotify_tracks_duration_non_negative', sql`${table.durationMs} >= 0`),
    index('spotify_tracks_album_id_idx').on(table.albumId),
  ],
);

export const spotifyTrackArtists = pgTable(
  'spotify_track_artists',
  {
    trackId: text('track_id')
      .notNull()
      .references(() => spotifyTracks.id, { onDelete: 'cascade' }),
    artistId: text('artist_id')
      .notNull()
      .references(() => spotifyArtists.id),
    position: integer('position').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.trackId, table.artistId] }),
    uniqueIndex('spotify_track_artists_track_position_unique').on(table.trackId, table.position),
    index('spotify_track_artists_artist_id_idx').on(table.artistId),
    check('spotify_track_artists_position_non_negative', sql`${table.position} >= 0`),
  ],
);

export const spotifyLibrarySyncs = pgTable(
  'spotify_library_syncs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').default('running').notNull(),
    nextOffset: integer('next_offset').default(0).notNull(),
    spotifyTotal: integer('spotify_total'),
    processedTrackCount: integer('processed_track_count').default(0).notNull(),
    startedAt: timestamp('started_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    failureCode: text('failure_code'),
    syncKind: text('sync_kind').default('full').notNull(),
    resultCode: text('result_code'),
  },
  (table) => [
    check(
      'spotify_library_syncs_status_valid',
      sql`${table.status} in ('running', 'completed', 'failed')`,
    ),
    check(
      'spotify_library_syncs_sync_kind_valid',
      sql`${table.syncKind} in ('full', 'incremental')`,
    ),
    check(
      'spotify_library_syncs_result_code_valid',
      sql`${table.resultCode} is null or ${table.resultCode} in ('applied', 'no_changes', 'full_sync_required')`,
    ),
    check('spotify_library_syncs_next_offset_non_negative', sql`${table.nextOffset} >= 0`),
    check(
      'spotify_library_syncs_processed_count_non_negative',
      sql`${table.processedTrackCount} >= 0`,
    ),
    check(
      'spotify_library_syncs_total_non_negative',
      sql`${table.spotifyTotal} is null or ${table.spotifyTotal} >= 0`,
    ),
    uniqueIndex('spotify_library_syncs_one_running_per_user')
      .on(table.userId)
      .where(sql`${table.status} = 'running'`),
    index('spotify_library_syncs_user_updated_idx').on(table.userId, table.updatedAt),
  ],
);

export const userSavedTracks = pgTable(
  'user_saved_tracks',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    trackId: text('track_id')
      .notNull()
      .references(() => spotifyTracks.id, { onDelete: 'cascade' }),
    savedAt: timestamp('saved_at', { mode: 'date', withTimezone: true }).notNull(),
    lastSeenSyncId: uuid('last_seen_sync_id')
      .notNull()
      .references(() => spotifyLibrarySyncs.id),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.trackId] }),
    index('user_saved_tracks_user_saved_at_idx').on(table.userId, table.savedAt),
    index('user_saved_tracks_user_last_seen_sync_idx').on(table.userId, table.lastSeenSyncId),
    index('user_saved_tracks_track_id_idx').on(table.trackId),
  ],
);
