import { describe, expect, it } from 'vitest';

import {
  INCREMENTAL_SYNC_MAX_PAGES,
  INCREMENTAL_SYNC_PAGE_LIMIT,
  MAX_FULL_SYNC_AGE_MS,
  MAX_INCREMENTAL_SYNCS_BETWEEN_FULL_SYNCS,
  coherentCompletionTimestamp,
  evaluateIncrementalEligibility,
  validateIncrementalScan,
} from './incremental-library-sync';

describe('incremental completion timestamps', () => {
  it('never completes before the database-created start time', () => {
    const startedAt = new Date('2026-08-08T10:16:09.083Z');
    const skewedDatabaseNow = new Date('2026-08-08T10:16:09.037Z');
    const laterDatabaseNow = new Date('2026-08-08T10:16:09.100Z');

    expect(coherentCompletionTimestamp(startedAt, skewedDatabaseNow)).toEqual(startedAt);
    expect(coherentCompletionTimestamp(startedAt, laterDatabaseNow)).toEqual(laterDatabaseNow);
  });
});

describe('incremental eligibility', () => {
  const now = new Date('2026-08-08T12:00:00Z');

  it('requires a completed full baseline', () => {
    expect(
      evaluateIncrementalEligibility({
        lastFullSyncAt: null,
        successfulIncrementalSyncsSinceFull: 0,
        now,
      }),
    ).toEqual({ available: false, reason: 'no_full_baseline' });
  });

  it('allows a recent baseline below the count threshold', () => {
    expect(
      evaluateIncrementalEligibility({
        lastFullSyncAt: new Date(now.getTime() - 1_000),
        successfulIncrementalSyncsSinceFull: 9,
        now,
      }),
    ).toEqual({ available: true, reason: 'eligible' });
  });

  it('requires reconciliation for an old baseline or count threshold', () => {
    expect(
      evaluateIncrementalEligibility({
        lastFullSyncAt: new Date(now.getTime() - MAX_FULL_SYNC_AGE_MS - 1),
        successfulIncrementalSyncsSinceFull: 0,
        now,
      }).reason,
    ).toBe('full_sync_too_old');
    expect(
      evaluateIncrementalEligibility({
        lastFullSyncAt: now,
        successfulIncrementalSyncsSinceFull: MAX_INCREMENTAL_SYNCS_BETWEEN_FULL_SYNCS,
        now,
      }).reason,
    ).toBe('incremental_limit_reached');
  });
});

describe('incremental safety proof', () => {
  it('is explicitly bounded to 150 saved tracks', () => {
    expect(INCREMENTAL_SYNC_PAGE_LIMIT).toBe(50);
    expect(INCREMENTAL_SYNC_MAX_PAGES).toBe(3);
  });

  it('accepts stable no-change and explainable additions/resaves', () => {
    expect(
      validateIncrementalScan({
        baselineCount: 2934,
        newMembershipCount: 0,
        spotifyTotals: [2934],
        stableOverlapReached: true,
      }),
    ).toBe('safe');
    expect(
      validateIncrementalScan({
        baselineCount: 2934,
        newMembershipCount: 10,
        spotifyTotals: [2944, 2944],
        stableOverlapReached: true,
      }),
    ).toBe('safe');
    expect(
      validateIncrementalScan({
        baselineCount: 2934,
        newMembershipCount: 0,
        spotifyTotals: [2934],
        stableOverlapReached: true,
      }),
    ).toBe('safe');
  });

  it.each([
    {
      name: 'removal',
      input: {
        baselineCount: 2934,
        newMembershipCount: 0,
        spotifyTotals: [2933],
        stableOverlapReached: true,
      },
    },
    {
      name: 'addition plus removal',
      input: {
        baselineCount: 2934,
        newMembershipCount: 1,
        spotifyTotals: [2934],
        stableOverlapReached: true,
      },
    },
    {
      name: 'unexpected growth',
      input: {
        baselineCount: 2934,
        newMembershipCount: 1,
        spotifyTotals: [2936],
        stableOverlapReached: true,
      },
    },
    {
      name: 'large delta',
      input: {
        baselineCount: 2934,
        newMembershipCount: 150,
        spotifyTotals: [3084, 3084, 3084],
        stableOverlapReached: false,
      },
    },
    {
      name: 'changing total',
      input: {
        baselineCount: 2934,
        newMembershipCount: 1,
        spotifyTotals: [2935, 2936],
        stableOverlapReached: true,
      },
    },
    {
      name: 'ambiguous boundary',
      input: {
        baselineCount: 2934,
        newMembershipCount: 0,
        spotifyTotals: [2934],
        stableOverlapReached: true,
        ambiguous: true,
      },
    },
  ])('requires full reconciliation for $name', ({ input }) => {
    expect(validateIncrementalScan(input)).toBe('full_sync_required');
  });
});
