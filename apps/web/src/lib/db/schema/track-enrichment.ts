import { sql } from 'drizzle-orm';
import {
  check,
  doublePrecision,
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
import { spotifyTracks } from './spotify-library';

export const trackAudioFeatures = pgTable(
  'track_audio_features',
  {
    trackId: text('track_id')
      .notNull()
      .references(() => spotifyTracks.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    providerTrackId: text('provider_track_id'),
    status: text('status').notNull(),
    acousticness: doublePrecision('acousticness'),
    danceability: doublePrecision('danceability'),
    energy: doublePrecision('energy'),
    instrumentalness: doublePrecision('instrumentalness'),
    liveness: doublePrecision('liveness'),
    loudness: doublePrecision('loudness'),
    speechiness: doublePrecision('speechiness'),
    tempo: doublePrecision('tempo'),
    valence: doublePrecision('valence'),
    fetchedAt: timestamp('fetched_at', { mode: 'date', withTimezone: true }),
    retryAfterAt: timestamp('retry_after_at', { mode: 'date', withTimezone: true }),
    createdAt: timestamp('created_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.trackId, table.provider] }),
    check('track_audio_features_status_valid', sql`${table.status} in ('available', 'not_found')`),
    check('track_audio_features_provider_valid', sql`${table.provider} = 'reccobeats'`),
    ...[
      'acousticness',
      'danceability',
      'energy',
      'instrumentalness',
      'liveness',
      'speechiness',
      'valence',
    ].map((name) =>
      check(
        `track_audio_features_${name}_range`,
        sql.raw(`"${name}" is null or ("${name}" >= 0 and "${name}" <= 1)`),
      ),
    ),
    check(
      'track_audio_features_tempo_non_negative',
      sql`${table.tempo} is null or ${table.tempo} >= 0`,
    ),
    index('track_audio_features_provider_status_idx').on(table.provider, table.status),
    index('track_audio_features_retry_idx').on(table.provider, table.status, table.retryAfterAt),
  ],
);

export const trackEnrichmentRuns = pgTable(
  'track_enrichment_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    status: text('status').default('running').notNull(),
    attemptedTrackCount: integer('attempted_track_count').default(0).notNull(),
    enrichedTrackCount: integer('enriched_track_count').default(0).notNull(),
    notFoundTrackCount: integer('not_found_track_count').default(0).notNull(),
    startedAt: timestamp('started_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp('completed_at', { mode: 'date', withTimezone: true }),
    updatedAt: timestamp('updated_at', { mode: 'date', withTimezone: true }).defaultNow().notNull(),
    resultCode: text('result_code'),
    retryAfterSeconds: integer('retry_after_seconds'),
  },
  (table) => [
    check(
      'track_enrichment_runs_status_valid',
      sql`${table.status} in ('running', 'completed', 'failed')`,
    ),
    check('track_enrichment_runs_provider_valid', sql`${table.provider} = 'reccobeats'`),
    check(
      'track_enrichment_runs_counts_non_negative',
      sql`${table.attemptedTrackCount} >= 0 and ${table.enrichedTrackCount} >= 0 and ${table.notFoundTrackCount} >= 0`,
    ),
    uniqueIndex('track_enrichment_runs_one_running_per_user')
      .on(table.userId)
      .where(sql`${table.status} = 'running'`),
    index('track_enrichment_runs_user_started_idx').on(table.userId, table.startedAt),
  ],
);
