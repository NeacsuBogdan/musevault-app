import 'server-only';

import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { withDatabase } from '@/lib/db/client';
import type { Database } from '@/lib/db/client';
import {
  spotifyAlbums,
  spotifyArtists,
  spotifyConnections,
  spotifyLibrarySyncs,
  spotifyTrackArtists,
  spotifyTracks,
  userSavedTracks,
  users,
} from '@/lib/db/schema';

type DatabaseExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

const TWO_MINUTES_MS = 120_000;
const THREE_MINUTES_MS = 180_000;
const FOUR_MINUTES_MS = 240_000;
const FIVE_MINUTES_MS = 300_000;

export type DurationBucket = keyof PersistedLibraryAnalytics['durationBuckets'];

export function classifyTrackDuration(durationMs: number): DurationBucket {
  if (durationMs < TWO_MINUTES_MS) return 'under2Minutes';
  if (durationMs < THREE_MINUTES_MS) return 'twoTo3Minutes';
  if (durationMs < FOUR_MINUTES_MS) return 'threeTo4Minutes';
  if (durationMs < FIVE_MINUTES_MS) return 'fourTo5Minutes';
  return 'fiveMinutesOrMore';
}

const paginationSchema = z
  .object({
    limit: z.number().int().min(1).max(100),
    offset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export function parsePersistedLibraryPagination(input: unknown): { limit: number; offset: number } {
  return paginationSchema.parse(input);
}

export interface PersistedLibrarySummary {
  savedTrackCount: number;
  uniqueArtistCount: number;
  totalDurationMs: number;
  lastSuccessfulSyncAt: string | null;
}

export async function getPersistedLibrarySummary(userId: string): Promise<PersistedLibrarySummary> {
  return withDatabase(async (database) => {
    const [summary] = await database
      .select({
        savedTrackCount: count(userSavedTracks.trackId),
        totalDurationMs: sql<number>`coalesce(sum(${spotifyTracks.durationMs}), 0)::bigint`,
      })
      .from(userSavedTracks)
      .innerJoin(spotifyTracks, eq(spotifyTracks.id, userSavedTracks.trackId))
      .where(eq(userSavedTracks.userId, userId));
    const [artists] = await database
      .select({
        uniqueArtistCount: sql<number>`count(distinct ${spotifyTrackArtists.artistId})::int`,
      })
      .from(userSavedTracks)
      .innerJoin(spotifyTrackArtists, eq(spotifyTrackArtists.trackId, userSavedTracks.trackId))
      .where(eq(userSavedTracks.userId, userId));
    const [connection] = await database
      .select({ lastSuccessfulSyncAt: spotifyConnections.lastSuccessfulSyncAt })
      .from(spotifyConnections)
      .where(eq(spotifyConnections.userId, userId))
      .limit(1);

    return {
      savedTrackCount: Number(summary?.savedTrackCount ?? 0),
      uniqueArtistCount: Number(artists?.uniqueArtistCount ?? 0),
      totalDurationMs: Number(summary?.totalDurationMs ?? 0),
      lastSuccessfulSyncAt: connection?.lastSuccessfulSyncAt?.toISOString() ?? null,
    };
  });
}

export interface PersistedSavedTrack {
  albumImageUrl: string | null;
  albumName: string;
  artistNames: string[];
  durationMs: number;
  explicit: boolean;
  id: string;
  name: string;
  savedAt: string;
  spotifyUrl: string;
}

export interface PersistedDashboardSnapshot {
  analytics: PersistedLibraryAnalytics;
  lastSuccessfulSyncAt: string | null;
  latestFullSyncAt: string;
  recentlySaved: PersistedSavedTrack[];
  savedTrackCount: number;
  totalDurationMs: number;
  uniqueArtistCount: number;
}

export interface PersistedLibraryAnalytics {
  topArtists: Array<{ id: string; name: string; savedTrackCount: number }>;
  topAlbums: Array<{
    id: string;
    name: string;
    imageUrl: string | null;
    savedTrackCount: number;
  }>;
  savedTimeline: Array<{
    year: number;
    savedTrackCount: number;
    cumulativeTrackCount: number;
  }>;
  explicitTrackCount: number;
  nonExplicitTrackCount: number;
  durationBuckets: {
    under2Minutes: number;
    twoTo3Minutes: number;
    threeTo4Minutes: number;
    fourTo5Minutes: number;
    fiveMinutesOrMore: number;
  };
  firstSavedAt: string | null;
  latestSavedAt: string | null;
}

interface SavedTimelineRow {
  year: number;
  savedTrackCount: number;
}

export function assembleSavedTimeline(rows: readonly SavedTimelineRow[]) {
  let cumulativeTrackCount = 0;
  return rows.map((row) => {
    const savedTrackCount = Number(row.savedTrackCount);
    cumulativeTrackCount += savedTrackCount;
    return { year: Number(row.year), savedTrackCount, cumulativeTrackCount };
  });
}

export type PersistedDashboardResult =
  | { status: 'success'; snapshot: PersistedDashboardSnapshot }
  | { status: 'sync_required' }
  | { status: 'sync_in_progress' };

type PersistedSavedTrackRow = Omit<PersistedSavedTrack, 'artistNames' | 'savedAt'> & {
  artistName: string;
  position: number;
  savedAt: Date;
};

export function assemblePersistedSavedTracks(
  rows: readonly PersistedSavedTrackRow[],
): PersistedSavedTrack[] {
  const tracks = new Map<string, PersistedSavedTrack>();
  for (const row of rows) {
    const existing = tracks.get(row.id);
    if (existing) {
      existing.artistNames.push(row.artistName);
    } else {
      tracks.set(row.id, {
        albumImageUrl: row.albumImageUrl,
        albumName: row.albumName,
        artistNames: [row.artistName],
        durationMs: row.durationMs,
        explicit: row.explicit,
        id: row.id,
        name: row.name,
        savedAt: row.savedAt.toISOString(),
        spotifyUrl: row.spotifyUrl,
      });
    }
  }
  return [...tracks.values()];
}

async function readPersistedSavedTracks(
  database: DatabaseExecutor,
  userId: string,
  pagination: { limit: number; offset: number },
): Promise<PersistedSavedTrack[]> {
  const page = await database
    .select({ trackId: userSavedTracks.trackId })
    .from(userSavedTracks)
    .where(eq(userSavedTracks.userId, userId))
    .orderBy(desc(userSavedTracks.savedAt), desc(userSavedTracks.trackId))
    .limit(pagination.limit)
    .offset(pagination.offset);

  if (page.length === 0) return [];

  const rows = await database
    .select({
      albumImageUrl: spotifyAlbums.imageUrl,
      albumName: spotifyAlbums.name,
      artistName: spotifyArtists.name,
      durationMs: spotifyTracks.durationMs,
      explicit: spotifyTracks.explicit,
      id: spotifyTracks.id,
      name: spotifyTracks.name,
      position: spotifyTrackArtists.position,
      savedAt: userSavedTracks.savedAt,
      spotifyUrl: spotifyTracks.spotifyUrl,
    })
    .from(userSavedTracks)
    .innerJoin(spotifyTracks, eq(spotifyTracks.id, userSavedTracks.trackId))
    .innerJoin(spotifyAlbums, eq(spotifyAlbums.id, spotifyTracks.albumId))
    .innerJoin(spotifyTrackArtists, eq(spotifyTrackArtists.trackId, spotifyTracks.id))
    .innerJoin(spotifyArtists, eq(spotifyArtists.id, spotifyTrackArtists.artistId))
    .where(
      and(
        eq(userSavedTracks.userId, userId),
        inArray(
          userSavedTracks.trackId,
          page.map((item) => item.trackId),
        ),
      ),
    )
    .orderBy(
      desc(userSavedTracks.savedAt),
      desc(userSavedTracks.trackId),
      asc(spotifyTrackArtists.position),
    );
  return assemblePersistedSavedTracks(rows);
}

async function readPersistedLibraryAnalytics(
  database: DatabaseExecutor,
  userId: string,
): Promise<PersistedLibraryAnalytics> {
  const topArtists = await database
    .select({
      id: spotifyArtists.id,
      name: spotifyArtists.name,
      savedTrackCount: sql<number>`count(distinct ${userSavedTracks.trackId})::int`,
    })
    .from(userSavedTracks)
    .innerJoin(spotifyTrackArtists, eq(spotifyTrackArtists.trackId, userSavedTracks.trackId))
    .innerJoin(spotifyArtists, eq(spotifyArtists.id, spotifyTrackArtists.artistId))
    .where(eq(userSavedTracks.userId, userId))
    .groupBy(spotifyArtists.id, spotifyArtists.name)
    .orderBy(
      desc(sql`count(distinct ${userSavedTracks.trackId})`),
      asc(spotifyArtists.name),
      asc(spotifyArtists.id),
    )
    .limit(5);

  const topAlbums = await database
    .select({
      id: spotifyAlbums.id,
      name: spotifyAlbums.name,
      imageUrl: spotifyAlbums.imageUrl,
      savedTrackCount: sql<number>`count(${userSavedTracks.trackId})::int`,
    })
    .from(userSavedTracks)
    .innerJoin(spotifyTracks, eq(spotifyTracks.id, userSavedTracks.trackId))
    .innerJoin(spotifyAlbums, eq(spotifyAlbums.id, spotifyTracks.albumId))
    .where(eq(userSavedTracks.userId, userId))
    .groupBy(spotifyAlbums.id, spotifyAlbums.name, spotifyAlbums.imageUrl)
    .orderBy(
      desc(sql`count(${userSavedTracks.trackId})`),
      asc(spotifyAlbums.name),
      asc(spotifyAlbums.id),
    )
    .limit(5);

  const timelineRows = await database
    .select({
      year: sql<number>`extract(year from ${userSavedTracks.savedAt} at time zone 'UTC')::int`,
      savedTrackCount: sql<number>`count(${userSavedTracks.trackId})::int`,
    })
    .from(userSavedTracks)
    .where(eq(userSavedTracks.userId, userId))
    .groupBy(sql`extract(year from ${userSavedTracks.savedAt} at time zone 'UTC')`)
    .orderBy(asc(sql`extract(year from ${userSavedTracks.savedAt} at time zone 'UTC')`));

  const [composition] = await database
    .select({
      explicitTrackCount: sql<number>`count(*) filter (where ${spotifyTracks.explicit})::int`,
      nonExplicitTrackCount: sql<number>`count(*) filter (where not ${spotifyTracks.explicit})::int`,
      under2Minutes: sql<number>`count(*) filter (where ${spotifyTracks.durationMs} < ${TWO_MINUTES_MS})::int`,
      twoTo3Minutes: sql<number>`count(*) filter (where ${spotifyTracks.durationMs} >= ${TWO_MINUTES_MS} and ${spotifyTracks.durationMs} < ${THREE_MINUTES_MS})::int`,
      threeTo4Minutes: sql<number>`count(*) filter (where ${spotifyTracks.durationMs} >= ${THREE_MINUTES_MS} and ${spotifyTracks.durationMs} < ${FOUR_MINUTES_MS})::int`,
      fourTo5Minutes: sql<number>`count(*) filter (where ${spotifyTracks.durationMs} >= ${FOUR_MINUTES_MS} and ${spotifyTracks.durationMs} < ${FIVE_MINUTES_MS})::int`,
      fiveMinutesOrMore: sql<number>`count(*) filter (where ${spotifyTracks.durationMs} >= ${FIVE_MINUTES_MS})::int`,
      firstSavedAt: sql<Date | null>`min(${userSavedTracks.savedAt})`.mapWith(
        userSavedTracks.savedAt,
      ),
      latestSavedAt: sql<Date | null>`max(${userSavedTracks.savedAt})`.mapWith(
        userSavedTracks.savedAt,
      ),
    })
    .from(userSavedTracks)
    .innerJoin(spotifyTracks, eq(spotifyTracks.id, userSavedTracks.trackId))
    .where(eq(userSavedTracks.userId, userId));

  return {
    topArtists: topArtists.map((artist) => ({
      ...artist,
      savedTrackCount: Number(artist.savedTrackCount),
    })),
    topAlbums: topAlbums.map((album) => ({
      ...album,
      savedTrackCount: Number(album.savedTrackCount),
    })),
    savedTimeline: assembleSavedTimeline(timelineRows),
    explicitTrackCount: Number(composition?.explicitTrackCount ?? 0),
    nonExplicitTrackCount: Number(composition?.nonExplicitTrackCount ?? 0),
    durationBuckets: {
      under2Minutes: Number(composition?.under2Minutes ?? 0),
      twoTo3Minutes: Number(composition?.twoTo3Minutes ?? 0),
      threeTo4Minutes: Number(composition?.threeTo4Minutes ?? 0),
      fourTo5Minutes: Number(composition?.fourTo5Minutes ?? 0),
      fiveMinutesOrMore: Number(composition?.fiveMinutesOrMore ?? 0),
    },
    firstSavedAt: composition?.firstSavedAt?.toISOString() ?? null,
    latestSavedAt: composition?.latestSavedAt?.toISOString() ?? null,
  };
}

export async function getPersistedDashboardSnapshot(
  spotifyAccountId: string,
): Promise<PersistedDashboardResult> {
  return withDatabase((database) =>
    database.transaction(async (transaction) => {
      const [user] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(eq(users.spotifyAccountId, spotifyAccountId))
        .limit(1);

      if (!user) return { status: 'sync_required' as const };

      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);

      const [runningFullSync] = await transaction
        .select({ id: spotifyLibrarySyncs.id })
        .from(spotifyLibrarySyncs)
        .where(
          and(
            eq(spotifyLibrarySyncs.userId, user.id),
            eq(spotifyLibrarySyncs.syncKind, 'full'),
            eq(spotifyLibrarySyncs.status, 'running'),
          ),
        )
        .limit(1);
      if (runningFullSync) return { status: 'sync_in_progress' as const };

      const [latestFullSync] = await transaction
        .select({ completedAt: spotifyLibrarySyncs.completedAt })
        .from(spotifyLibrarySyncs)
        .where(
          and(
            eq(spotifyLibrarySyncs.userId, user.id),
            eq(spotifyLibrarySyncs.syncKind, 'full'),
            eq(spotifyLibrarySyncs.status, 'completed'),
          ),
        )
        .orderBy(desc(spotifyLibrarySyncs.completedAt))
        .limit(1);
      if (!latestFullSync?.completedAt) return { status: 'sync_required' as const };

      const [summary] = await transaction
        .select({
          savedTrackCount: count(userSavedTracks.trackId),
          totalDurationMs: sql<number>`coalesce(sum(${spotifyTracks.durationMs}), 0)::bigint`,
        })
        .from(userSavedTracks)
        .innerJoin(spotifyTracks, eq(spotifyTracks.id, userSavedTracks.trackId))
        .where(eq(userSavedTracks.userId, user.id));
      const [artists] = await transaction
        .select({
          uniqueArtistCount: sql<number>`count(distinct ${spotifyTrackArtists.artistId})::int`,
        })
        .from(userSavedTracks)
        .innerJoin(spotifyTrackArtists, eq(spotifyTrackArtists.trackId, userSavedTracks.trackId))
        .where(eq(userSavedTracks.userId, user.id));
      const [connection] = await transaction
        .select({ lastSuccessfulSyncAt: spotifyConnections.lastSuccessfulSyncAt })
        .from(spotifyConnections)
        .where(eq(spotifyConnections.userId, user.id))
        .limit(1);

      return {
        status: 'success' as const,
        snapshot: {
          analytics: await readPersistedLibraryAnalytics(transaction, user.id),
          lastSuccessfulSyncAt: connection?.lastSuccessfulSyncAt?.toISOString() ?? null,
          latestFullSyncAt: latestFullSync.completedAt.toISOString(),
          recentlySaved: await readPersistedSavedTracks(transaction, user.id, {
            limit: 5,
            offset: 0,
          }),
          savedTrackCount: Number(summary?.savedTrackCount ?? 0),
          totalDurationMs: Number(summary?.totalDurationMs ?? 0),
          uniqueArtistCount: Number(artists?.uniqueArtistCount ?? 0),
        },
      };
    }),
  );
}

export async function getPersistedSavedTracks(
  userId: string,
  paginationInput: unknown,
): Promise<PersistedSavedTrack[]> {
  const pagination = parsePersistedLibraryPagination(paginationInput);

  return withDatabase(async (database) => {
    return readPersistedSavedTracks(database, userId, pagination);
  });
}
