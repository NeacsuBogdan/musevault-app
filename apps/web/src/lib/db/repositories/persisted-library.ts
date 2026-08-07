import 'server-only';

import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { withDatabase } from '@/lib/db/client';
import {
  spotifyAlbums,
  spotifyArtists,
  spotifyConnections,
  spotifyTrackArtists,
  spotifyTracks,
  userSavedTracks,
} from '@/lib/db/schema';

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

export async function getPersistedSavedTracks(
  userId: string,
  paginationInput: unknown,
): Promise<PersistedSavedTrack[]> {
  const pagination = parsePersistedLibraryPagination(paginationInput);

  return withDatabase(async (database) => {
    const page = await database
      .select({ trackId: userSavedTracks.trackId })
      .from(userSavedTracks)
      .where(eq(userSavedTracks.userId, userId))
      .orderBy(desc(userSavedTracks.savedAt))
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
      .orderBy(desc(userSavedTracks.savedAt), asc(spotifyTrackArtists.position));
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
  });
}
