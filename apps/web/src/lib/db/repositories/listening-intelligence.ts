import 'server-only';

import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import { hasRequiredSpotifyAuthorizationScopes } from '@/lib/auth/oauth';
import { withDatabase } from '@/lib/db/client';
import {
  spotifyArtists,
  spotifyConnections,
  spotifyListeningSyncs,
  spotifyPlayHistory,
  spotifyTopArtistSnapshotItems,
  spotifyTopItemSnapshots,
  spotifyTopTrackSnapshotItems,
  spotifyTrackArtists,
  spotifyTracks,
  users,
} from '@/lib/db/schema';
import type { SpotifyTopTimeRange } from '@/types/spotify';

export interface ListeningInsights {
  authorizationRequired: boolean;
  sync: {
    status: 'never_synced' | 'running' | 'completed' | 'failed';
    resultCode: string | null;
    failureCode: string | null;
    processedPlayCount: number;
    completedAt: string | null;
  };
  summary: {
    totalRecordedPlays: number;
    distinctTracks: number;
    distinctArtists: number;
    earliestPlayedAt: string | null;
    latestPlayedAt: string | null;
  };
  recentPlays: Array<{ trackId: string; trackName: string; playedAt: string }>;
  recentPeriod: {
    recordedPlayCount: number;
    distinctTracks: number;
    distinctArtists: number;
    recordedCoverageDays: number;
    topTracks: Array<{ id: string; name: string; playCount: number }>;
    topArtists: Array<{ id: string; name: string; playCount: number }>;
  };
  affinity: Array<{
    timeRange: SpotifyTopTimeRange;
    capturedAt: string;
    tracks: Array<{ id: string; name: string; rank: number }>;
    artists: Array<{ id: string; name: string; rank: number }>;
  }>;
}

const ranges: SpotifyTopTimeRange[] = ['short_term', 'medium_term', 'long_term'];
const emptySync = {
  status: 'never_synced' as const,
  resultCode: null,
  failureCode: null,
  processedPlayCount: 0,
  completedAt: null,
};
const emptySummary = {
  totalRecordedPlays: 0,
  distinctTracks: 0,
  distinctArtists: 0,
  earliestPlayedAt: null,
  latestPlayedAt: null,
};

export async function getListeningInsights(
  spotifyAccountId: string,
  now = new Date(),
): Promise<ListeningInsights> {
  return withDatabase(async (db) => {
    const [identity] = await db
      .select({ userId: users.id, scopes: spotifyConnections.scopes })
      .from(users)
      .innerJoin(spotifyConnections, eq(spotifyConnections.userId, users.id))
      .where(eq(users.spotifyAccountId, spotifyAccountId))
      .limit(1);
    if (!identity || !hasRequiredSpotifyAuthorizationScopes(identity.scopes))
      return {
        authorizationRequired: true,
        sync: emptySync,
        summary: emptySummary,
        recentPlays: [],
        recentPeriod: {
          recordedPlayCount: 0,
          distinctTracks: 0,
          distinctArtists: 0,
          recordedCoverageDays: 0,
          topTracks: [],
          topArtists: [],
        },
        affinity: [],
      };

    const userId = identity.userId;
    const [sync] = await db
      .select()
      .from(spotifyListeningSyncs)
      .where(eq(spotifyListeningSyncs.userId, userId))
      .orderBy(desc(spotifyListeningSyncs.startedAt))
      .limit(1);
    const [summary] = await db
      .select({
        totalRecordedPlays: sql<number>`count(*)::int`,
        distinctTracks: sql<number>`count(distinct ${spotifyPlayHistory.trackId})::int`,
        earliestPlayedAt: sql<Date | null>`min(${spotifyPlayHistory.playedAt})`.mapWith(
          spotifyPlayHistory.playedAt,
        ),
        latestPlayedAt: sql<Date | null>`max(${spotifyPlayHistory.playedAt})`.mapWith(
          spotifyPlayHistory.playedAt,
        ),
      })
      .from(spotifyPlayHistory)
      .where(eq(spotifyPlayHistory.userId, userId));
    const [artistSummary] = await db
      .select({
        distinctArtists: sql<number>`count(distinct ${spotifyTrackArtists.artistId})::int`,
      })
      .from(spotifyPlayHistory)
      .innerJoin(spotifyTrackArtists, eq(spotifyTrackArtists.trackId, spotifyPlayHistory.trackId))
      .where(eq(spotifyPlayHistory.userId, userId));
    const recentPlays = await db
      .select({
        trackId: spotifyTracks.id,
        trackName: spotifyTracks.name,
        playedAt: spotifyPlayHistory.playedAt,
      })
      .from(spotifyPlayHistory)
      .innerJoin(spotifyTracks, eq(spotifyTracks.id, spotifyPlayHistory.trackId))
      .where(eq(spotifyPlayHistory.userId, userId))
      .orderBy(desc(spotifyPlayHistory.playedAt), asc(spotifyTracks.id))
      .limit(10);
    const since = new Date(now.getTime() - 7 * 86_400_000);
    const periodWhere = and(
      eq(spotifyPlayHistory.userId, userId),
      gte(spotifyPlayHistory.playedAt, since),
    );
    const [period] = await db
      .select({
        recordedPlayCount: sql<number>`count(*)::int`,
        distinctTracks: sql<number>`count(distinct ${spotifyPlayHistory.trackId})::int`,
      })
      .from(spotifyPlayHistory)
      .where(periodWhere);
    const [periodArtists] = await db
      .select({
        distinctArtists: sql<number>`count(distinct ${spotifyTrackArtists.artistId})::int`,
      })
      .from(spotifyPlayHistory)
      .innerJoin(spotifyTrackArtists, eq(spotifyTrackArtists.trackId, spotifyPlayHistory.trackId))
      .where(periodWhere);
    const topTracks = await db
      .select({
        id: spotifyTracks.id,
        name: spotifyTracks.name,
        playCount: sql<number>`count(*)::int`,
      })
      .from(spotifyPlayHistory)
      .innerJoin(spotifyTracks, eq(spotifyTracks.id, spotifyPlayHistory.trackId))
      .where(periodWhere)
      .groupBy(spotifyTracks.id, spotifyTracks.name)
      .orderBy(desc(sql`count(*)`), asc(spotifyTracks.name), asc(spotifyTracks.id))
      .limit(5);
    const topArtists = await db
      .select({
        id: spotifyArtists.id,
        name: spotifyArtists.name,
        playCount: sql<number>`count(distinct (${spotifyPlayHistory.playedAt}, ${spotifyPlayHistory.trackId}))::int`,
      })
      .from(spotifyPlayHistory)
      .innerJoin(spotifyTrackArtists, eq(spotifyTrackArtists.trackId, spotifyPlayHistory.trackId))
      .innerJoin(spotifyArtists, eq(spotifyArtists.id, spotifyTrackArtists.artistId))
      .where(periodWhere)
      .groupBy(spotifyArtists.id, spotifyArtists.name)
      .orderBy(
        desc(sql`count(distinct (${spotifyPlayHistory.playedAt}, ${spotifyPlayHistory.trackId}))`),
        asc(spotifyArtists.name),
        asc(spotifyArtists.id),
      )
      .limit(5);

    const snapshotRows = await db
      .select()
      .from(spotifyTopItemSnapshots)
      .where(eq(spotifyTopItemSnapshots.userId, userId))
      .orderBy(
        desc(spotifyTopItemSnapshots.snapshotDate),
        desc(spotifyTopItemSnapshots.capturedAt),
      );
    const latestByRange = new Map<string, (typeof snapshotRows)[number]>();
    for (const row of snapshotRows)
      if (!latestByRange.has(row.timeRange)) latestByRange.set(row.timeRange, row);
    const latest = [...latestByRange.values()].filter((row) =>
      ranges.includes(row.timeRange as SpotifyTopTimeRange),
    );
    const ids = latest.map((row) => row.id);
    const trackItems = ids.length
      ? await db
          .select({
            snapshotId: spotifyTopTrackSnapshotItems.snapshotId,
            id: spotifyTracks.id,
            name: spotifyTracks.name,
            rank: spotifyTopTrackSnapshotItems.rank,
          })
          .from(spotifyTopTrackSnapshotItems)
          .innerJoin(spotifyTracks, eq(spotifyTracks.id, spotifyTopTrackSnapshotItems.trackId))
          .where(inArray(spotifyTopTrackSnapshotItems.snapshotId, ids))
          .orderBy(asc(spotifyTopTrackSnapshotItems.rank))
      : [];
    const artistItems = ids.length
      ? await db
          .select({
            snapshotId: spotifyTopArtistSnapshotItems.snapshotId,
            id: spotifyArtists.id,
            name: spotifyArtists.name,
            rank: spotifyTopArtistSnapshotItems.rank,
          })
          .from(spotifyTopArtistSnapshotItems)
          .innerJoin(spotifyArtists, eq(spotifyArtists.id, spotifyTopArtistSnapshotItems.artistId))
          .where(inArray(spotifyTopArtistSnapshotItems.snapshotId, ids))
          .orderBy(asc(spotifyTopArtistSnapshotItems.rank))
      : [];
    const earliest = summary?.earliestPlayedAt ?? null;
    const coverageDays = earliest
      ? Math.min(
          7,
          Math.max(
            1,
            Math.ceil((now.getTime() - Math.max(earliest.getTime(), since.getTime())) / 86_400_000),
          ),
        )
      : 0;
    return {
      authorizationRequired: false,
      sync: sync
        ? {
            status: sync.status as 'running' | 'completed' | 'failed',
            resultCode: sync.resultCode,
            failureCode: sync.failureCode,
            processedPlayCount: sync.processedPlayCount,
            completedAt: sync.completedAt?.toISOString() ?? null,
          }
        : emptySync,
      summary: {
        totalRecordedPlays: Number(summary?.totalRecordedPlays ?? 0),
        distinctTracks: Number(summary?.distinctTracks ?? 0),
        distinctArtists: Number(artistSummary?.distinctArtists ?? 0),
        earliestPlayedAt: earliest?.toISOString() ?? null,
        latestPlayedAt: summary?.latestPlayedAt?.toISOString() ?? null,
      },
      recentPlays: recentPlays.map((play) => ({
        trackId: play.trackId,
        trackName: play.trackName,
        playedAt: play.playedAt.toISOString(),
      })),
      recentPeriod: {
        recordedPlayCount: Number(period?.recordedPlayCount ?? 0),
        distinctTracks: Number(period?.distinctTracks ?? 0),
        distinctArtists: Number(periodArtists?.distinctArtists ?? 0),
        recordedCoverageDays: coverageDays,
        topTracks: topTracks.map((item) => ({ ...item, playCount: Number(item.playCount) })),
        topArtists: topArtists.map((item) => ({ ...item, playCount: Number(item.playCount) })),
      },
      affinity: latest.map((snapshot) => ({
        timeRange: snapshot.timeRange as SpotifyTopTimeRange,
        capturedAt: snapshot.capturedAt.toISOString(),
        tracks: trackItems
          .filter((item) => item.snapshotId === snapshot.id)
          .map((item) => ({ id: item.id, name: item.name, rank: item.rank })),
        artists: artistItems
          .filter((item) => item.snapshotId === snapshot.id)
          .map((item) => ({ id: item.id, name: item.name, rank: item.rank })),
      })),
    };
  });
}
