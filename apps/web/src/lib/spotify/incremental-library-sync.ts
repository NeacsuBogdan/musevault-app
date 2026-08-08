import 'server-only';

import { and, desc, eq, gt, inArray, sql } from 'drizzle-orm';

import type { SpotifySession } from '@/lib/auth/session';
import { withDatabase } from '@/lib/db/client';
import type { Database } from '@/lib/db/client';
import {
  spotifyConnections,
  spotifyLibrarySyncs,
  spotifyTrackArtists,
  spotifyTracks,
  userSavedTracks,
  users,
} from '@/lib/db/schema';
import type { SavedTrack } from '@/types/spotify';
import {
  classifyLibrarySyncFailure,
  FullLibrarySyncError,
  persistPreparedLibraryItems,
  prepareFullLibraryPage,
} from './library-sync';
import { loadSpotifySavedTracksPage } from './saved-tracks';

export const INCREMENTAL_SYNC_PAGE_LIMIT = 50;
export const INCREMENTAL_SYNC_MAX_PAGES = 3;
export const MAX_INCREMENTAL_SYNCS_BETWEEN_FULL_SYNCS = 10;
export const MAX_FULL_SYNC_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type IncrementalResult =
  | 'applied'
  | 'no_changes'
  | 'full_sync_required'
  | 'sync_in_progress';
export type IncrementalEligibilityReason =
  | 'eligible'
  | 'no_full_baseline'
  | 'full_sync_too_old'
  | 'incremental_limit_reached';

export interface SafeIncrementalSyncState {
  available: boolean;
  reason: IncrementalEligibilityReason;
  result: IncrementalResult | null;
  lastSuccessfulSyncAt: string | null;
  lastFullSyncAt: string | null;
  successfulIncrementalSyncsSinceFull: number;
  summary: {
    savedTrackCount: number;
    uniqueArtistCount: number;
    totalDurationMs: number;
  } | null;
}

export function evaluateIncrementalEligibility(input: {
  lastFullSyncAt: Date | null;
  successfulIncrementalSyncsSinceFull: number;
  now: Date;
}): { available: boolean; reason: IncrementalEligibilityReason } {
  if (!input.lastFullSyncAt) return { available: false, reason: 'no_full_baseline' };
  if (input.now.getTime() - input.lastFullSyncAt.getTime() > MAX_FULL_SYNC_AGE_MS) {
    return { available: false, reason: 'full_sync_too_old' };
  }
  if (input.successfulIncrementalSyncsSinceFull >= MAX_INCREMENTAL_SYNCS_BETWEEN_FULL_SYNCS) {
    return { available: false, reason: 'incremental_limit_reached' };
  }
  return { available: true, reason: 'eligible' };
}

export function validateIncrementalScan(input: {
  baselineCount: number;
  newMembershipCount: number;
  spotifyTotals: readonly number[];
  stableOverlapReached: boolean;
  ambiguous?: boolean;
}): 'safe' | 'full_sync_required' {
  const [firstTotal] = input.spotifyTotals;
  if (
    input.ambiguous ||
    !input.stableOverlapReached ||
    firstTotal === undefined ||
    input.spotifyTotals.some((total) => total !== firstTotal) ||
    firstTotal !== input.baselineCount + input.newMembershipCount
  ) {
    return 'full_sync_required';
  }
  return 'safe';
}

export function coherentCompletionTimestamp(startedAt: Date, databaseNow: Date): Date {
  return databaseNow.getTime() >= startedAt.getTime() ? databaseNow : startedAt;
}

type DatabaseExecutor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

async function readContext(database: DatabaseExecutor, userId: string) {
  const [full] = await database
    .select({ completedAt: spotifyLibrarySyncs.completedAt })
    .from(spotifyLibrarySyncs)
    .where(
      and(
        eq(spotifyLibrarySyncs.userId, userId),
        eq(spotifyLibrarySyncs.syncKind, 'full'),
        eq(spotifyLibrarySyncs.status, 'completed'),
      ),
    )
    .orderBy(desc(spotifyLibrarySyncs.completedAt))
    .limit(1);
  const fullAt = full?.completedAt ?? null;
  const [incrementalCount] = fullAt
    ? await database
        .select({ value: sql<number>`count(*)::int` })
        .from(spotifyLibrarySyncs)
        .where(
          and(
            eq(spotifyLibrarySyncs.userId, userId),
            eq(spotifyLibrarySyncs.syncKind, 'incremental'),
            eq(spotifyLibrarySyncs.status, 'completed'),
            inArray(spotifyLibrarySyncs.resultCode, ['applied', 'no_changes']),
            gt(spotifyLibrarySyncs.completedAt, fullAt),
          ),
        )
    : [{ value: 0 }];
  const [connection] = await database
    .select({ lastSuccessfulSyncAt: spotifyConnections.lastSuccessfulSyncAt })
    .from(spotifyConnections)
    .where(eq(spotifyConnections.userId, userId))
    .limit(1);
  return {
    fullAt,
    incrementalCount: Number(incrementalCount?.value ?? 0),
    lastSuccessfulSyncAt: connection?.lastSuccessfulSyncAt ?? null,
  };
}

async function readSummary(database: DatabaseExecutor, userId: string) {
  const [library] = await database
    .select({
      savedTrackCount: sql<number>`count(*)::int`,
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
  return {
    savedTrackCount: Number(library?.savedTrackCount ?? 0),
    totalDurationMs: Number(library?.totalDurationMs ?? 0),
    uniqueArtistCount: Number(artists?.uniqueArtistCount ?? 0),
  };
}

function state(
  context: Awaited<ReturnType<typeof readContext>>,
  eligibility: ReturnType<typeof evaluateIncrementalEligibility>,
  summary: SafeIncrementalSyncState['summary'],
  result: IncrementalResult | null,
): SafeIncrementalSyncState {
  return {
    ...eligibility,
    result,
    lastSuccessfulSyncAt: context.lastSuccessfulSyncAt?.toISOString() ?? null,
    lastFullSyncAt: context.fullAt?.toISOString() ?? null,
    successfulIncrementalSyncsSinceFull: context.incrementalCount,
    summary,
  };
}

export async function getIncrementalSyncEligibility(
  accountId: string,
): Promise<SafeIncrementalSyncState> {
  try {
    return await withDatabase(async (database) => {
      const [user] = await database
        .select({ id: users.id })
        .from(users)
        .where(eq(users.spotifyAccountId, accountId))
        .limit(1);
      if (!user) {
        const context = { fullAt: null, incrementalCount: 0, lastSuccessfulSyncAt: null };
        return state(
          context,
          evaluateIncrementalEligibility({
            lastFullSyncAt: null,
            successfulIncrementalSyncsSinceFull: 0,
            now: new Date(),
          }),
          null,
          null,
        );
      }
      const context = await readContext(database, user.id);
      return state(
        context,
        evaluateIncrementalEligibility({
          lastFullSyncAt: context.fullAt,
          successfulIncrementalSyncsSinceFull: context.incrementalCount,
          now: new Date(),
        }),
        await readSummary(database, user.id),
        null,
      );
    });
  } catch {
    throw new FullLibrarySyncError('database_failure');
  }
}

export async function processIncrementalLibrarySync(
  session: SpotifySession,
): Promise<SafeIncrementalSyncState> {
  let claim: {
    syncId: string;
    userId: string;
    baselineCount: number;
    context: Awaited<ReturnType<typeof readContext>>;
    eligibility: ReturnType<typeof evaluateIncrementalEligibility>;
  };
  try {
    const claimed = await withDatabase((database) =>
      database.transaction(async (transaction) => {
        const [user] = await transaction
          .select({ id: users.id })
          .from(users)
          .where(eq(users.spotifyAccountId, session.accountId))
          .limit(1);
        if (!user) throw new FullLibrarySyncError('database_failure');
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${user.id}))`);
        const [running] = await transaction
          .select({ id: spotifyLibrarySyncs.id })
          .from(spotifyLibrarySyncs)
          .where(
            and(eq(spotifyLibrarySyncs.userId, user.id), eq(spotifyLibrarySyncs.status, 'running')),
          )
          .limit(1);
        const context = await readContext(transaction, user.id);
        const eligibility = evaluateIncrementalEligibility({
          lastFullSyncAt: context.fullAt,
          successfulIncrementalSyncsSinceFull: context.incrementalCount,
          now: new Date(),
        });
        if (running) return { busy: true as const, context, eligibility, userId: user.id };
        if (!eligibility.available)
          return { required: true as const, context, eligibility, userId: user.id };
        const [count] = await transaction
          .select({ value: sql<number>`count(*)::int` })
          .from(userSavedTracks)
          .where(eq(userSavedTracks.userId, user.id));
        const [sync] = await transaction
          .insert(spotifyLibrarySyncs)
          .values({ syncKind: 'incremental', userId: user.id })
          .returning({ id: spotifyLibrarySyncs.id });
        if (!sync) throw new FullLibrarySyncError('database_failure');
        return {
          baselineCount: Number(count?.value ?? 0),
          context,
          eligibility,
          syncId: sync.id,
          userId: user.id,
        };
      }),
    );
    if ('busy' in claimed)
      return state(claimed.context, claimed.eligibility, null, 'sync_in_progress');
    if ('required' in claimed)
      return state(claimed.context, claimed.eligibility, null, 'full_sync_required');
    claim = claimed;
  } catch (error) {
    if (error instanceof FullLibrarySyncError) throw error;
    throw new FullLibrarySyncError('database_failure');
  }

  const candidates = new Map<string, SavedTrack>();
  const newIds = new Set<string>();
  const seen = new Map<string, string>();
  const totals: number[] = [];
  let stableOverlapReached = false;
  let ambiguous = false;

  try {
    for (let pageNumber = 0; pageNumber < INCREMENTAL_SYNC_MAX_PAGES; pageNumber += 1) {
      const expectedOffset = pageNumber * INCREMENTAL_SYNC_PAGE_LIMIT;
      const page = await loadSpotifySavedTracksPage(session, {
        limit: INCREMENTAL_SYNC_PAGE_LIMIT,
        offset: expectedOffset,
      });
      if (page.offset !== expectedOffset) ambiguous = true;
      totals.push(page.total);
      const ids = [...new Set(page.items.map((item) => item.id))];
      const persisted =
        ids.length === 0
          ? []
          : await withDatabase((database) =>
              database
                .select({ savedAt: userSavedTracks.savedAt, trackId: userSavedTracks.trackId })
                .from(userSavedTracks)
                .where(
                  and(
                    eq(userSavedTracks.userId, claim.userId),
                    inArray(userSavedTracks.trackId, ids),
                  ),
                ),
            );
      const persistedById = new Map(
        persisted.map((item) => [item.trackId, item.savedAt.toISOString()]),
      );
      let stablePage = true;
      for (const item of page.items) {
        const priorSeen = seen.get(item.id);
        if (priorSeen !== undefined) ambiguous = true;
        seen.set(item.id, item.savedAt);
        const savedAt = persistedById.get(item.id);
        if (!savedAt) {
          newIds.add(item.id);
          candidates.set(item.id, item);
          stablePage = false;
        } else if (new Date(item.savedAt).toISOString() !== savedAt) {
          candidates.set(item.id, item);
          stablePage = false;
        }
      }
      if (stablePage) {
        stableOverlapReached = true;
        break;
      }
    }
  } catch (error) {
    const failure = classifyLibrarySyncFailure(error);
    await failIncrementalClaim(claim.syncId, failure.code);
    throw failure;
  }

  const validation = validateIncrementalScan({
    ambiguous,
    baselineCount: claim.baselineCount,
    newMembershipCount: newIds.size,
    spotifyTotals: totals,
    stableOverlapReached,
  });
  return finalizeIncremental(claim, [...candidates.values()], validation, totals[0] ?? null);
}

async function failIncrementalClaim(syncId: string, failureCode: string = 'unexpected_failure') {
  try {
    await withDatabase((database) =>
      database
        .update(spotifyLibrarySyncs)
        .set({ failureCode, status: 'failed', updatedAt: new Date() })
        .where(and(eq(spotifyLibrarySyncs.id, syncId), eq(spotifyLibrarySyncs.status, 'running'))),
    );
  } catch {
    /* best effort */
  }
}

async function finalizeIncremental(
  claim: {
    syncId: string;
    userId: string;
    baselineCount: number;
    context: Awaited<ReturnType<typeof readContext>>;
    eligibility: ReturnType<typeof evaluateIncrementalEligibility>;
  },
  candidates: SavedTrack[],
  validation: 'safe' | 'full_sync_required',
  spotifyTotal: number | null,
): Promise<SafeIncrementalSyncState> {
  try {
    return await withDatabase((database) =>
      database.transaction(async (transaction) => {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${claim.userId}))`);
        const [sync] = await transaction
          .select({
            databaseNow: sql<Date>`clock_timestamp()`.mapWith(spotifyLibrarySyncs.startedAt),
            startedAt: spotifyLibrarySyncs.startedAt,
            status: spotifyLibrarySyncs.status,
          })
          .from(spotifyLibrarySyncs)
          .where(eq(spotifyLibrarySyncs.id, claim.syncId))
          .limit(1);
        const [count] = await transaction
          .select({ value: sql<number>`count(*)::int` })
          .from(userSavedTracks)
          .where(eq(userSavedTracks.userId, claim.userId));
        const baselineChanged =
          !sync || sync.status !== 'running' || Number(count?.value ?? 0) !== claim.baselineCount;
        if (!sync) throw new FullLibrarySyncError('database_failure');
        const now = coherentCompletionTimestamp(sync.startedAt, sync.databaseNow);
        if (validation === 'full_sync_required' || baselineChanged) {
          await transaction
            .update(spotifyLibrarySyncs)
            .set({
              completedAt: now,
              failureCode: null,
              resultCode: 'full_sync_required',
              status: 'completed',
              updatedAt: now,
            })
            .where(eq(spotifyLibrarySyncs.id, claim.syncId));
          return state(
            claim.context,
            claim.eligibility,
            await readSummary(transaction, claim.userId),
            'full_sync_required',
          );
        }
        if (candidates.length > 0) {
          await persistPreparedLibraryItems(
            transaction,
            prepareFullLibraryPage(candidates, claim.syncId, claim.userId, now),
            now,
          );
        }
        const result = candidates.length > 0 ? 'applied' : 'no_changes';
        await transaction
          .update(spotifyLibrarySyncs)
          .set({
            completedAt: now,
            failureCode: null,
            processedTrackCount: candidates.length,
            resultCode: result,
            spotifyTotal,
            status: 'completed',
            updatedAt: now,
          })
          .where(eq(spotifyLibrarySyncs.id, claim.syncId));
        await transaction
          .update(spotifyConnections)
          .set({ lastSuccessfulSyncAt: now, updatedAt: now })
          .where(eq(spotifyConnections.userId, claim.userId));
        const context = {
          ...claim.context,
          incrementalCount: claim.context.incrementalCount + 1,
          lastSuccessfulSyncAt: now,
        };
        return state(
          context,
          claim.eligibility,
          await readSummary(transaction, claim.userId),
          result,
        );
      }),
    );
  } catch {
    await failIncrementalClaim(claim.syncId);
    throw new FullLibrarySyncError('database_failure');
  }
}
