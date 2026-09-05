import { describe, expect, it } from 'vitest';

import { collectRediscoverSignals } from './signals';

const now = new Date('2026-09-05T12:00:00.000Z');

function collect(overrides: Partial<Parameters<typeof collectRediscoverSignals>[0]> = {}) {
  return collectRediscoverSignals({
    savedAt: new Date('2025-09-05T12:00:00.000Z'),
    now,
    latestRecordedPlayAt: new Date('2026-08-06T12:00:00.000Z'),
    recordedPlayCount7d: 1,
    recordedPlayCount30d: 3,
    recordedPlayCount90d: 7,
    recordedListeningCoverage: true,
    recentRecordedEventsAvailable: true,
    affinity: {
      shortTerm: { snapshotAvailable: true, rank: 4 },
      mediumTerm: { snapshotAvailable: true, rank: 8 },
      longTerm: { snapshotAvailable: true, rank: 12 },
    },
    ...overrides,
  });
}

describe('intelligence signals', () => {
  it('calculates saved age and latest recorded-play age in whole bounded days', () => {
    const signals = collect();
    expect(signals.savedAgeDays).toBe(365);
    expect(signals.daysSinceLatestRecordedPlay).toBe(30);
  });

  it('preserves bounded 7/30/90-day recorded counts and affinity ranks', () => {
    const signals = collect();
    expect([
      signals.recordedPlayCount7d,
      signals.recordedPlayCount30d,
      signals.recordedPlayCount90d,
    ]).toEqual([1, 3, 7]);
    expect(signals.affinity).toEqual({
      shortTerm: { snapshotAvailable: true, rank: 4 },
      mediumTerm: { snapshotAvailable: true, rank: 8 },
      longTerm: { snapshotAvailable: true, rank: 12 },
    });
  });

  it('keeps missing listening and affinity data unknown', () => {
    const signals = collect({
      latestRecordedPlayAt: null,
      recordedListeningCoverage: false,
      recentRecordedEventsAvailable: false,
      affinity: {
        shortTerm: { snapshotAvailable: false, rank: null },
        mediumTerm: { snapshotAvailable: false, rank: null },
        longTerm: { snapshotAvailable: false, rank: null },
      },
    });
    expect(signals.daysSinceLatestRecordedPlay).toBeNull();
    expect(signals.affinity.shortTerm).toEqual({ snapshotAvailable: false, rank: null });
  });
});
