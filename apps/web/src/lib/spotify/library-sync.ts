import 'server-only';

import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import type { SpotifySession } from '@/lib/auth/session';
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
import type { SavedTrack } from '@/types/spotify';
import { parseRetryAfterSeconds, SpotifyApiError } from './errors';
import { loadSpotifySavedTracksPage } from './saved-tracks';
import { SpotifyTokenRefreshError } from './tokens';

export const FULL_LIBRARY_SYNC_PAGE_LIMIT = 50;
export const FULL_LIBRARY_SYNC_PAGES_PER_REQUEST = 3;

export type FullLibrarySyncFailureCode =
  | 'authorization_expired'
  | 'rate_limited'
  | 'temporarily_unavailable'
  | 'database_failure'
  | 'unexpected_failure';

export type FullLibrarySyncRequestCode = FullLibrarySyncFailureCode | 'sync_in_progress';

export type FullLibrarySyncStatus = 'running' | 'completed' | 'failed';

export function isFullLibraryPageComplete(page: {
  items: readonly unknown[];
  offset: number;
  total: number;
}): boolean {
  const nextOffset = page.offset + page.items.length;
  return (
    page.items.length === 0 ||
    page.items.length < FULL_LIBRARY_SYNC_PAGE_LIMIT ||
    nextOffset >= page.total
  );
}

export interface SafeFullLibrarySyncState {
  status: FullLibrarySyncStatus | 'never_synced';
  processedTrackCount: number;
  spotifyTotal: number | null;
  failureCode: FullLibrarySyncFailureCode | null;
  lastSuccessfulSyncAt: string | null;
  summary: {
    savedTrackCount: number;
    uniqueArtistCount: number;
    totalDurationMs: number;
  } | null;
}

export class FullLibrarySyncError extends Error {
  constructor(
    public readonly code: FullLibrarySyncRequestCode,
    public readonly retryAfter: number | null = null,
  ) {
    super('Full library synchronization could not continue.');
    this.name = 'FullLibrarySyncError';
  }
}

function safeFailureCode(value: string | null): FullLibrarySyncFailureCode | null {
  const codes: FullLibrarySyncFailureCode[] = [
    'authorization_expired',
    'rate_limited',
    'temporarily_unavailable',
    'database_failure',
    'unexpected_failure',
  ];

  return codes.find((code) => code === value) ?? null;
}

function mapState(
  sync: {
    status: string;
    processedTrackCount: number;
    spotifyTotal: number | null;
    failureCode: string | null;
  } | null,
  lastSuccessfulSyncAt: Date | null,
  summary: SafeFullLibrarySyncState['summary'] = null,
): SafeFullLibrarySyncState {
  return {
    status:
      sync?.status === 'running' || sync?.status === 'completed' || sync?.status === 'failed'
        ? sync.status
        : 'never_synced',
    processedTrackCount: sync?.processedTrackCount ?? 0,
    spotifyTotal: sync?.spotifyTotal ?? null,
    failureCode: safeFailureCode(sync?.failureCode ?? null),
    lastSuccessfulSyncAt: lastSuccessfulSyncAt?.toISOString() ?? null,
    summary,
  };
}

export async function getFullLibrarySyncStatus(
  spotifyAccountId: string,
): Promise<SafeFullLibrarySyncState> {
  try {
    return await withDatabase(async (database) => {
      const [user] = await database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.spotifyAccountId, spotifyAccountId))
        .limit(1);

      if (!user) {
        return mapState(null, null);
      }

      const [sync] = await database
        .select({
          failureCode: spotifyLibrarySyncs.failureCode,
          processedTrackCount: spotifyLibrarySyncs.processedTrackCount,
          spotifyTotal: spotifyLibrarySyncs.spotifyTotal,
          status: spotifyLibrarySyncs.status,
        })
        .from(spotifyLibrarySyncs)
        .where(eq(spotifyLibrarySyncs.userId, user.id))
        .orderBy(desc(spotifyLibrarySyncs.startedAt))
        .limit(1);
      const [connection] = await database
        .select({ lastSuccessfulSyncAt: spotifyConnections.lastSuccessfulSyncAt })
        .from(spotifyConnections)
        .where(eq(spotifyConnections.userId, user.id))
        .limit(1);
      const [librarySummary] = await database
        .select({
          savedTrackCount: sql<number>`count(*)::int`,
          totalDurationMs: sql<number>`coalesce(sum(${spotifyTracks.durationMs}), 0)::bigint`,
        })
        .from(userSavedTracks)
        .innerJoin(spotifyTracks, eq(spotifyTracks.id, userSavedTracks.trackId))
        .where(eq(userSavedTracks.userId, user.id));
      const [artistSummary] = await database
        .select({
          uniqueArtistCount: sql<number>`count(distinct ${spotifyTrackArtists.artistId})::int`,
        })
        .from(userSavedTracks)
        .innerJoin(spotifyTrackArtists, eq(spotifyTrackArtists.trackId, userSavedTracks.trackId))
        .where(eq(userSavedTracks.userId, user.id));

      return mapState(sync ?? null, connection?.lastSuccessfulSyncAt ?? null, {
        savedTrackCount: Number(librarySummary?.savedTrackCount ?? 0),
        totalDurationMs: Number(librarySummary?.totalDurationMs ?? 0),
        uniqueArtistCount: Number(artistSummary?.uniqueArtistCount ?? 0),
      });
    });
  } catch {
    throw new FullLibrarySyncError('database_failure');
  }
}

function deduplicateById<T extends { id: string }>(items: readonly T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function prepareFullLibraryPage(
  items: readonly SavedTrack[],
  syncId: string,
  userId: string,
  now: Date,
) {
  return {
    albums: deduplicateById(
      items.map((track) => ({
        id: track.albumId,
        imageUrl: track.albumImageUrl,
        name: track.albumName,
        updatedAt: now,
      })),
    ),
    artists: deduplicateById(
      items.flatMap((track) =>
        track.artistIds.map((id, position) => ({
          id,
          name: track.artistNames[position] ?? '',
          updatedAt: now,
        })),
      ),
    ),
    memberships: deduplicateById(
      items.map((track) => ({
        id: track.id,
        lastSeenSyncId: syncId,
        savedAt: new Date(track.savedAt),
        trackId: track.id,
        updatedAt: now,
        userId,
      })),
    ).map((membership) => ({
      lastSeenSyncId: membership.lastSeenSyncId,
      savedAt: membership.savedAt,
      trackId: membership.trackId,
      updatedAt: membership.updatedAt,
      userId: membership.userId,
    })),
    relationships: items.flatMap((track) =>
      track.artistIds.map((artistId, position) => ({ artistId, position, trackId: track.id })),
    ),
    tracks: deduplicateById(
      items.map((track) => ({
        albumId: track.albumId,
        durationMs: track.durationMs,
        explicit: track.explicit,
        id: track.id,
        name: track.name,
        spotifyUrl: track.spotifyUrl,
        updatedAt: now,
      })),
    ),
  };
}

export async function persistPreparedLibraryItems(
  transaction: Parameters<Parameters<Database['transaction']>[0]>[0],
  prepared: ReturnType<typeof prepareFullLibraryPage>,
  now: Date,
): Promise<void> {
  const { albums, artists, tracks } = prepared;
  if (albums.length > 0) {
    await transaction
      .insert(spotifyAlbums)
      .values(albums)
      .onConflictDoUpdate({
        target: spotifyAlbums.id,
        set: { imageUrl: sql`excluded.image_url`, name: sql`excluded.name`, updatedAt: now },
      });
  }
  if (artists.length > 0) {
    await transaction
      .insert(spotifyArtists)
      .values(artists)
      .onConflictDoUpdate({
        target: spotifyArtists.id,
        set: { name: sql`excluded.name`, updatedAt: now },
      });
  }
  if (tracks.length === 0) return;
  await transaction
    .insert(spotifyTracks)
    .values(tracks)
    .onConflictDoUpdate({
      target: spotifyTracks.id,
      set: {
        albumId: sql`excluded.album_id`,
        durationMs: sql`excluded.duration_ms`,
        explicit: sql`excluded.explicit`,
        name: sql`excluded.name`,
        spotifyUrl: sql`excluded.spotify_url`,
        updatedAt: now,
      },
    });
  const trackIds = tracks.map((track) => track.id);
  await transaction
    .delete(spotifyTrackArtists)
    .where(inArray(spotifyTrackArtists.trackId, trackIds));
  if (prepared.relationships.length > 0) {
    await transaction
      .insert(spotifyTrackArtists)
      .values(prepared.relationships)
      .onConflictDoNothing();
  }
  await transaction
    .insert(userSavedTracks)
    .values(prepared.memberships)
    .onConflictDoUpdate({
      target: [userSavedTracks.userId, userSavedTracks.trackId],
      set: {
        lastSeenSyncId: sql`excluded.last_seen_sync_id`,
        savedAt: sql`excluded.saved_at`,
        updatedAt: now,
      },
    });
}

export function classifyLibrarySyncFailure(error: unknown): FullLibrarySyncError {
  if (error instanceof FullLibrarySyncError) {
    return error;
  }

  if (error instanceof SpotifyTokenRefreshError) {
    if (error.kind === 'permanent') return new FullLibrarySyncError('authorization_expired');
    if (error.status === 429) {
      return new FullLibrarySyncError('rate_limited', parseRetryAfterSeconds(error.retryAfter));
    }
    return new FullLibrarySyncError('temporarily_unavailable');
  }

  if (error instanceof SpotifyApiError) {
    if (error.kind === 'unauthorized' || error.kind === 'forbidden') {
      return new FullLibrarySyncError('authorization_expired');
    }
    if (error.kind === 'rate_limited') {
      return new FullLibrarySyncError('rate_limited', error.retryAfter);
    }
    return new FullLibrarySyncError('temporarily_unavailable');
  }

  return new FullLibrarySyncError('database_failure');
}

async function recordFailure(
  spotifyAccountId: string,
  failure: FullLibrarySyncError,
): Promise<void> {
  if (failure.code === 'sync_in_progress') return;
  try {
    await withDatabase(async (database) => {
      const [user] = await database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.spotifyAccountId, spotifyAccountId))
        .limit(1);

      if (!user) return;

      await database
        .update(spotifyLibrarySyncs)
        .set({
          failureCode: failure.code,
          status: failure.code === 'authorization_expired' ? 'failed' : 'running',
          updatedAt: new Date(),
        })
        .where(
          and(eq(spotifyLibrarySyncs.userId, user.id), eq(spotifyLibrarySyncs.status, 'running')),
        );
    });
  } catch {
    // Failure recording is best-effort and never replaces the safe public error.
  }
}

export async function processFullLibrarySyncChunk(
  session: SpotifySession,
): Promise<SafeFullLibrarySyncState> {
  try {
    return await withDatabase((database) =>
      database.transaction(async (transaction) => {
        const [user] = await transaction
          .select({ id: users.id })
          .from(users)
          .where(eq(users.spotifyAccountId, session.accountId))
          .limit(1);

        if (!user) throw new FullLibrarySyncError('database_failure');

        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);

        let [sync] = await transaction
          .select()
          .from(spotifyLibrarySyncs)
          .where(
            and(eq(spotifyLibrarySyncs.userId, user.id), eq(spotifyLibrarySyncs.status, 'running')),
          )
          .limit(1);

        if (!sync) {
          [sync] = await transaction
            .insert(spotifyLibrarySyncs)
            .values({ syncKind: 'full', userId: user.id })
            .returning();
        } else if (sync.syncKind !== 'full') {
          throw new FullLibrarySyncError('sync_in_progress');
        }

        if (!sync) throw new FullLibrarySyncError('database_failure');

        let completed = false;
        let offset = sync.nextOffset;
        let processedTrackCount = sync.processedTrackCount;
        let spotifyTotal = sync.spotifyTotal;

        for (
          let pageNumber = 0;
          pageNumber < FULL_LIBRARY_SYNC_PAGES_PER_REQUEST;
          pageNumber += 1
        ) {
          const page = await loadSpotifySavedTracksPage(session, {
            limit: FULL_LIBRARY_SYNC_PAGE_LIMIT,
            offset,
          });
          const now = new Date();
          const prepared = prepareFullLibraryPage(page.items, sync.id, user.id, now);
          await persistPreparedLibraryItems(transaction, prepared, now);

          const nextOffset = page.offset + page.items.length;
          processedTrackCount += page.items.length;
          spotifyTotal = page.total;
          completed = isFullLibraryPageComplete(page);
          offset = nextOffset;

          await transaction
            .update(spotifyLibrarySyncs)
            .set({
              failureCode: null,
              nextOffset: offset,
              processedTrackCount,
              spotifyTotal,
              updatedAt: now,
            })
            .where(
              and(eq(spotifyLibrarySyncs.id, sync.id), eq(spotifyLibrarySyncs.status, 'running')),
            );

          if (completed) break;
        }

        const now = new Date();
        if (completed) {
          await transaction
            .delete(userSavedTracks)
            .where(
              and(eq(userSavedTracks.userId, user.id), ne(userSavedTracks.lastSeenSyncId, sync.id)),
            );
          await transaction
            .update(spotifyLibrarySyncs)
            .set({
              completedAt: now,
              failureCode: null,
              resultCode: 'applied',
              status: 'completed',
              updatedAt: now,
            })
            .where(
              and(eq(spotifyLibrarySyncs.id, sync.id), eq(spotifyLibrarySyncs.status, 'running')),
            );
          await transaction
            .update(spotifyConnections)
            .set({ lastSuccessfulSyncAt: now, updatedAt: now })
            .where(eq(spotifyConnections.userId, user.id));
        }

        const [connection] = await transaction
          .select({ lastSuccessfulSyncAt: spotifyConnections.lastSuccessfulSyncAt })
          .from(spotifyConnections)
          .where(eq(spotifyConnections.userId, user.id))
          .limit(1);
        const [librarySummary] = await transaction
          .select({
            savedTrackCount: sql<number>`count(*)::int`,
            totalDurationMs: sql<number>`coalesce(sum(${spotifyTracks.durationMs}), 0)::bigint`,
          })
          .from(userSavedTracks)
          .innerJoin(spotifyTracks, eq(spotifyTracks.id, userSavedTracks.trackId))
          .where(eq(userSavedTracks.userId, user.id));
        const [artistSummary] = await transaction
          .select({
            uniqueArtistCount: sql<number>`count(distinct ${spotifyTrackArtists.artistId})::int`,
          })
          .from(userSavedTracks)
          .innerJoin(spotifyTrackArtists, eq(spotifyTrackArtists.trackId, userSavedTracks.trackId))
          .where(eq(userSavedTracks.userId, user.id));

        return mapState(
          {
            failureCode: null,
            processedTrackCount,
            spotifyTotal,
            status: completed ? 'completed' : 'running',
          },
          completed ? now : (connection?.lastSuccessfulSyncAt ?? null),
          {
            savedTrackCount: Number(librarySummary?.savedTrackCount ?? 0),
            totalDurationMs: Number(librarySummary?.totalDurationMs ?? 0),
            uniqueArtistCount: Number(artistSummary?.uniqueArtistCount ?? 0),
          },
        );
      }),
    );
  } catch (error) {
    const failure = classifyLibrarySyncFailure(error);
    await recordFailure(session.accountId, failure);
    throw failure;
  }
}
