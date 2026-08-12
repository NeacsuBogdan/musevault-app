import 'server-only';

import { and, desc, eq, sql } from 'drizzle-orm';
import type { SpotifySession } from '@/lib/auth/session';
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
  users,
} from '@/lib/db/schema';
import type { SpotifyTopTimeRange } from '@/types/spotify';
import { persistSpotifyCatalog, prepareSpotifyCatalog } from './catalog-persistence';
import { parseRetryAfterSeconds, SpotifyApiError } from './errors';
import { loadRecentlyPlayed, loadTopArtists, loadTopTracks } from './listening-client';
import { SpotifyTokenRefreshError } from './tokens';

export const RECENT_PLAY_LIMIT = 50;
export const LISTENING_PAGES_PER_REQUEST = 3;
export const INITIAL_BACKFILL_PAGE_LIMIT = 10;
export const TOP_ITEM_LIMIT = 20;
const ranges: SpotifyTopTimeRange[] = ['short_term', 'medium_term', 'long_term'];

export function getListeningContinuationCursor(
  page: Pick<import('@/types/spotify').RecentlyPlayedPage, 'cursors' | 'hasNext'>,
  syncMode: 'initial' | 'incremental',
): number | null {
  if (!page.hasNext) return null;
  const cursor = syncMode === 'initial' ? page.cursors.before : page.cursors.after;
  if (cursor === null) {
    throw new SpotifyApiError('invalid_response', 200, null, 'schema');
  }
  return cursor;
}

export type ListeningSyncCode =
  | 'authorization_required'
  | 'rate_limited'
  | 'spotify_unavailable'
  | 'unexpected_failure';
export class ListeningSyncError extends Error {
  constructor(
    public readonly code: ListeningSyncCode,
    public readonly retryAfter: number | null = null,
  ) {
    super('Listening synchronization could not continue.');
    this.name = 'ListeningSyncError';
  }
}

export function classifyListeningSyncFailure(error: unknown): ListeningSyncError {
  if (error instanceof ListeningSyncError) return error;
  if (error instanceof SpotifyTokenRefreshError)
    return error.status === 429
      ? new ListeningSyncError('rate_limited', parseRetryAfterSeconds(error.retryAfter))
      : new ListeningSyncError(
          error.kind === 'permanent' ? 'authorization_required' : 'spotify_unavailable',
        );
  if (error instanceof SpotifyApiError) {
    if (error.kind === 'unauthorized' || error.kind === 'forbidden')
      return new ListeningSyncError('authorization_required');
    if (error.kind === 'rate_limited')
      return new ListeningSyncError('rate_limited', error.retryAfter);
    return new ListeningSyncError('spotify_unavailable');
  }
  return new ListeningSyncError('unexpected_failure');
}

async function persistAffinity(
  transaction: Parameters<Parameters<import('@/lib/db/client').Database['transaction']>[0]>[0],
  userId: string,
  session: SpotifySession,
  now: Date,
) {
  const snapshotDate = now.toISOString().slice(0, 10);
  for (const timeRange of ranges) {
    const [tracks, artists] = await Promise.all([
      loadTopTracks(session, timeRange),
      loadTopArtists(session, timeRange),
    ]);
    if (tracks.length > TOP_ITEM_LIMIT || artists.length > TOP_ITEM_LIMIT)
      throw new ListeningSyncError('spotify_unavailable');
    await persistSpotifyCatalog(transaction, prepareSpotifyCatalog(tracks, now), now);
    if (artists.length)
      await transaction
        .insert(spotifyArtists)
        .values(artists.map((artist) => ({ ...artist, updatedAt: now })))
        .onConflictDoUpdate({
          target: spotifyArtists.id,
          set: { name: sql`excluded.name`, updatedAt: now },
        });
    const [snapshot] = await transaction
      .insert(spotifyTopItemSnapshots)
      .values({ userId, snapshotDate, capturedAt: now, timeRange })
      .onConflictDoUpdate({
        target: [
          spotifyTopItemSnapshots.userId,
          spotifyTopItemSnapshots.snapshotDate,
          spotifyTopItemSnapshots.timeRange,
        ],
        set: { capturedAt: now },
      })
      .returning({ id: spotifyTopItemSnapshots.id });
    if (!snapshot) throw new ListeningSyncError('unexpected_failure');
    await transaction
      .delete(spotifyTopTrackSnapshotItems)
      .where(eq(spotifyTopTrackSnapshotItems.snapshotId, snapshot.id));
    await transaction
      .delete(spotifyTopArtistSnapshotItems)
      .where(eq(spotifyTopArtistSnapshotItems.snapshotId, snapshot.id));
    if (tracks.length)
      await transaction.insert(spotifyTopTrackSnapshotItems).values(
        tracks.map((track, index) => ({
          snapshotId: snapshot.id,
          trackId: track.id,
          rank: index + 1,
        })),
      );
    if (artists.length)
      await transaction.insert(spotifyTopArtistSnapshotItems).values(
        artists.map((artist, index) => ({
          snapshotId: snapshot.id,
          artistId: artist.id,
          rank: index + 1,
        })),
      );
  }
}

async function recordFailure(accountId: string, failure: ListeningSyncError) {
  try {
    await withDatabase(async (db) => {
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.spotifyAccountId, accountId))
        .limit(1);
      if (!user) return;
      await db
        .update(spotifyListeningSyncs)
        .set({
          failureCode: failure.code,
          status: failure.code === 'authorization_required' ? 'failed' : 'running',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(spotifyListeningSyncs.userId, user.id),
            eq(spotifyListeningSyncs.status, 'running'),
          ),
        );
    });
  } catch {
    /* best effort */
  }
}

export async function processListeningSyncChunk(session: SpotifySession): Promise<{
  status: 'running' | 'completed';
  result: 'applied' | 'no_changes' | 'backfill_limit_reached';
  processedPlayCount: number;
}> {
  try {
    return await withDatabase((db) =>
      db.transaction(async (transaction) => {
        const [identity] = await transaction
          .select({ userId: users.id, scopes: spotifyConnections.scopes })
          .from(users)
          .innerJoin(spotifyConnections, eq(spotifyConnections.userId, users.id))
          .where(eq(users.spotifyAccountId, session.accountId))
          .limit(1);
        if (!identity || !hasRequiredSpotifyAuthorizationScopes(identity.scopes))
          throw new ListeningSyncError('authorization_required');
        await transaction.execute(
          sql`select pg_advisory_xact_lock(hashtext(${identity.userId} || ':listening'))`,
        );
        let [sync] = await transaction
          .select()
          .from(spotifyListeningSyncs)
          .where(
            and(
              eq(spotifyListeningSyncs.userId, identity.userId),
              eq(spotifyListeningSyncs.status, 'running'),
            ),
          )
          .limit(1);
        if (!sync) {
          const [latestPlay] = await transaction
            .select({ playedAt: spotifyPlayHistory.playedAt })
            .from(spotifyPlayHistory)
            .where(eq(spotifyPlayHistory.userId, identity.userId))
            .orderBy(desc(spotifyPlayHistory.playedAt))
            .limit(1);
          [sync] = await transaction
            .insert(spotifyListeningSyncs)
            .values({
              userId: identity.userId,
              syncMode: latestPlay ? 'incremental' : 'initial',
              cursorAfter: latestPlay?.playedAt.getTime(),
            })
            .returning();
        }
        if (!sync) throw new ListeningSyncError('unexpected_failure');
        if (sync.syncMode !== 'initial' && sync.syncMode !== 'incremental')
          throw new ListeningSyncError('unexpected_failure');
        let insertedThisRequest = 0;
        let processedPlayCount = sync.processedPlayCount;
        let processedPageCount = sync.processedPageCount;
        let cursorBefore = sync.cursorBefore ?? undefined;
        let cursorAfter = sync.cursorAfter ?? undefined;
        let caughtUp = false;
        let backfillLimitReached = false;
        for (let pageIndex = 0; pageIndex < LISTENING_PAGES_PER_REQUEST; pageIndex += 1) {
          const page = await loadRecentlyPlayed(session, {
            limit: RECENT_PLAY_LIMIT,
            ...(sync.syncMode === 'initial' ? { before: cursorBefore } : { after: cursorAfter }),
          });
          const continuationCursor = getListeningContinuationCursor(page, sync.syncMode);
          const now = new Date();
          await persistSpotifyCatalog(
            transaction,
            prepareSpotifyCatalog(
              page.items.map((play) => play.track),
              now,
            ),
            now,
          );
          let inserted = 0;
          if (page.items.length) {
            const rows = await transaction
              .insert(spotifyPlayHistory)
              .values(
                page.items.map((play) => ({
                  userId: identity.userId,
                  trackId: play.track.id,
                  playedAt: new Date(play.playedAt),
                  contextType: play.context?.type ?? null,
                  contextUri: play.context?.uri ?? null,
                  contextSpotifyUrl: play.context?.spotifyUrl ?? null,
                })),
              )
              .onConflictDoNothing()
              .returning({ trackId: spotifyPlayHistory.trackId });
            inserted = rows.length;
          }
          insertedThisRequest += inserted;
          processedPlayCount += inserted;
          processedPageCount += 1;
          if (sync.syncMode === 'initial') cursorBefore = continuationCursor ?? cursorBefore;
          else cursorAfter = continuationCursor ?? cursorAfter;
          backfillLimitReached =
            sync.syncMode === 'initial' &&
            processedPageCount >= INITIAL_BACKFILL_PAGE_LIMIT &&
            page.hasNext;
          caughtUp = !page.hasNext || page.items.length === 0 || backfillLimitReached;
          await transaction
            .update(spotifyListeningSyncs)
            .set({
              cursorAfter,
              cursorBefore,
              failureCode: null,
              processedPageCount,
              processedPlayCount,
              updatedAt: now,
            })
            .where(eq(spotifyListeningSyncs.id, sync.id));
          if (caughtUp) break;
        }
        if (!caughtUp)
          return {
            status: 'running',
            result: insertedThisRequest ? 'applied' : 'no_changes',
            processedPlayCount,
          };
        const now = new Date();
        await persistAffinity(transaction, identity.userId, session, now);
        const result = backfillLimitReached
          ? 'backfill_limit_reached'
          : processedPlayCount > 0
            ? 'applied'
            : 'no_changes';
        await transaction
          .update(spotifyListeningSyncs)
          .set({
            completedAt: now,
            failureCode: null,
            resultCode: result,
            status: 'completed',
            updatedAt: now,
          })
          .where(eq(spotifyListeningSyncs.id, sync.id));
        return { status: 'completed', result, processedPlayCount };
      }),
    );
  } catch (error) {
    const failure = classifyListeningSyncFailure(error);
    await recordFailure(session.accountId, failure);
    throw failure;
  }
}
