import { describe, expect, it } from 'vitest';

import {
  buildListeningWindowBoundaries,
  buildRotationExplanation,
  calculateListeningFreshness,
  calculateRecordedMomentum,
  calculateRecordedShare,
  calculateRepeatIntensity,
  calculateRotationEvidenceLevel,
  calculateRotationFrequency7,
  calculateRotationFrequency30,
  calculateRotationIntelligence,
  calculateRotationRecency,
  calculateTopTrackConcentration,
  classifyListeningWindow,
  collectListeningWindowSignals,
  collectRotationSignals,
} from './listening';

const now = new Date('2026-09-12T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

function signals(overrides: Partial<Parameters<typeof collectRotationSignals>[0]> = {}) {
  return collectRotationSignals({
    latestRecordedPlayAt: daysAgo(1),
    recordedPlayCount7d: 1,
    recordedPlayCount30d: 1,
    activeRecordedDays30d: 1,
    recordedCoverageStartedAt: daysAgo(30),
    ...overrides,
  });
}

describe('listening windows', () => {
  const boundaries = buildListeningWindowBoundaries(now);

  it('uses one deterministic injected now for exact 7/14/30-day boundaries', () => {
    expect(boundaries).toEqual({
      now,
      current7StartedAt: daysAgo(7),
      previous7StartedAt: daysAgo(14),
      current30StartedAt: daysAgo(30),
    });
    expect(buildListeningWindowBoundaries(now)).toEqual(boundaries);
  });

  it.each([
    [new Date(now.getTime() - 1), 'current7'],
    [daysAgo(7), 'current7'],
    [new Date(daysAgo(7).getTime() - 1), 'previous7'],
    [daysAgo(14), 'previous7'],
    [new Date(daysAgo(14).getTime() - 1), 'current30_only'],
    [daysAgo(30), 'current30_only'],
    [new Date(daysAgo(30).getTime() - 1), null],
    [now, null],
  ] as const)('classifies %s into %s', (playedAt, expected) => {
    expect(classifyListeningWindow(playedAt, boundaries)).toBe(expected);
  });

  it('never assigns an event to both current7 and previous7', () => {
    const samples = Array.from(
      { length: 57 },
      (_, index) => new Date(now.getTime() - index * 6 * 60 * 60 * 1_000),
    );
    for (const sample of samples) {
      const window = classifyListeningWindow(sample, boundaries);
      expect(Number(window === 'current7') + Number(window === 'previous7')).toBeLessThanOrEqual(1);
    }
  });

  it('keeps raw window counts separate and normalizes invalid negative counts', () => {
    expect(
      collectListeningWindowSignals({
        current7RecordedCount: 4,
        previous7RecordedCount: 2,
        current30RecordedCount: -1,
      }),
    ).toEqual({
      current7RecordedCount: 4,
      previous7RecordedCount: 2,
      current30RecordedCount: 0,
    });
  });
});

describe('listening data freshness', () => {
  it('keeps a missing successful sync as never synced', () => {
    expect(calculateListeningFreshness(null, now)).toBe('never_synced');
  });

  it('treats a successful sync inside current7 as refreshed', () => {
    expect(calculateListeningFreshness(daysAgo(1), now)).toBe('refreshed_within_current7');
  });

  it('includes the exact current7 lower boundary', () => {
    expect(calculateListeningFreshness(daysAgo(7), now)).toBe('refreshed_within_current7');
  });

  it('treats a successful sync before current7 as stale', () => {
    expect(calculateListeningFreshness(new Date(daysAgo(7).getTime() - 1), now)).toBe(
      'stale_for_current7',
    );
  });

  it('uses the injected now deterministically', () => {
    const sync = new Date('2026-09-05T12:00:00.000Z');
    expect(calculateListeningFreshness(sync, now)).toBe('refreshed_within_current7');
    expect(calculateListeningFreshness(sync, new Date('2026-09-12T12:00:00.001Z'))).toBe(
      'stale_for_current7',
    );
  });
});

describe('Rotation Score', () => {
  it.each([
    [0, 55],
    [1, 52],
    [3, 46],
    [7, 36],
    [14, 24],
    [30, 0],
  ])('preserves the %s-day recency anchor at %s', (days, expected) => {
    expect(calculateRotationRecency(days)).toBe(expected);
  });

  it('interpolates recency deterministically and clamps it', () => {
    expect(calculateRotationRecency(2)).toBe(49);
    expect(calculateRotationRecency(5)).toBe(41);
    expect(calculateRotationRecency(22)).toBe(12);
    expect(calculateRotationRecency(31)).toBe(0);
    expect(calculateRotationRecency(null)).toBe(0);
  });

  it.each([
    [0, 0],
    [1, 5],
    [2, 9],
    [3, 12],
    [5, 16],
    [8, 20],
    [12, 25],
  ])('preserves the %s-play 30-day frequency anchor at %s', (count, expected) => {
    expect(calculateRotationFrequency30(count)).toBe(expected);
  });

  it.each([
    [0, 0],
    [1, 5],
    [2, 9],
    [3, 12],
    [5, 16],
    [8, 20],
  ])('preserves the %s-play 7-day frequency anchor at %s', (count, expected) => {
    expect(calculateRotationFrequency7(count)).toBe(expected);
  });

  it('interpolates frequencies and applies their caps', () => {
    expect(calculateRotationFrequency30(4)).toBe(14);
    expect(calculateRotationFrequency30(6)).toBe(17);
    expect(calculateRotationFrequency30(10)).toBe(23);
    expect(calculateRotationFrequency30(100)).toBe(25);
    expect(calculateRotationFrequency7(4)).toBe(14);
    expect(calculateRotationFrequency7(6)).toBe(17);
    expect(calculateRotationFrequency7(100)).toBe(20);
  });

  it('is bounded to 0..100 and missing data creates no positive score', () => {
    const missing = calculateRotationIntelligence(
      signals({
        latestRecordedPlayAt: null,
        recordedPlayCount7d: 0,
        recordedPlayCount30d: 0,
        activeRecordedDays30d: 0,
        recordedCoverageStartedAt: null,
      }),
      now,
    );
    expect(missing.rotationScore).toBe(0);
    expect(missing.explanation).toBeNull();
    expect(
      calculateRotationIntelligence(
        signals({
          latestRecordedPlayAt: now,
          recordedPlayCount7d: 100,
          recordedPlayCount30d: 100,
        }),
        now,
      ).rotationScore,
    ).toBe(100);
  });

  it('increases with more recent activity or more recorded frequency', () => {
    const older = calculateRotationIntelligence(
      signals({ latestRecordedPlayAt: daysAgo(14) }),
      now,
    );
    const newer = calculateRotationIntelligence(signals({ latestRecordedPlayAt: daysAgo(1) }), now);
    const repeated = calculateRotationIntelligence(
      signals({ recordedPlayCount7d: 5, recordedPlayCount30d: 8 }),
      now,
    );
    expect(newer.rotationScore).toBeGreaterThan(older.rotationScore);
    expect(repeated.rotationScore).toBeGreaterThan(newer.rotationScore);
  });
});

describe('Rotation Score evidence and explanations', () => {
  it('does not make global coverage alone High evidence', () => {
    expect(
      calculateRotationEvidenceLevel(
        signals({
          latestRecordedPlayAt: null,
          recordedPlayCount7d: 0,
          recordedPlayCount30d: 0,
          activeRecordedDays30d: 0,
          recordedCoverageStartedAt: daysAgo(365),
        }),
      ),
    ).toBe('low');
  });

  it('keeps sparse evidence Low, repeated evidence Medium, and strong distributed evidence High', () => {
    expect(calculateRotationEvidenceLevel(signals())).toBe('low');
    expect(calculateRotationEvidenceLevel(signals({ recordedPlayCount30d: 2 }))).toBe('medium');
    expect(
      calculateRotationEvidenceLevel(
        signals({ recordedPlayCount7d: 3, recordedPlayCount30d: 6, activeRecordedDays30d: 3 }),
      ),
    ).toBe('high');
  });

  it('creates one factual MuseVault-recorded explanation', () => {
    expect(
      buildRotationExplanation(signals({ recordedPlayCount7d: 5, recordedPlayCount30d: 8 }), now),
    ).toEqual({
      code: 'recorded_frequency_7d',
      text: '5 MuseVault-recorded plays in the last 7 days',
      evidenceSource: 'recorded_listening',
    });
  });
});

describe('Listening Pulse calculations', () => {
  it('calculates repeat intensity from event counts per track', () => {
    expect(calculateRepeatIntensity([40, 20, ...Array.from({ length: 40 }, () => 1)])).toBe(60);
  });

  it('calculates top-five-track concentration from the event denominator', () => {
    expect(
      calculateTopTrackConcentration([10, 9, 8, 7, 6, ...Array.from({ length: 60 }, () => 1)]),
    ).toBe(40);
  });

  it('keeps an empty denominator unavailable', () => {
    expect(calculateRepeatIntensity([])).toBeNull();
    expect(calculateTopTrackConcentration([])).toBeNull();
  });

  it('allows 100% primary-artist concentration when the top five account for every event', () => {
    expect(calculateRecordedShare(50, 50)).toBe(100);
  });
});

describe('Recorded Momentum', () => {
  const row = (
    artistId: string,
    current7RecordedCount: number,
    previous7RecordedCount: number,
  ) => ({
    artistId,
    artistName: `Artist ${artistId}`,
    current7RecordedCount,
    previous7RecordedCount,
  });

  it('requires a full 14 days of captured coverage', () => {
    expect(
      calculateRecordedMomentum([row('a', 4, 1)], daysAgo(13.99), 'refreshed_within_current7', now)
        .state,
    ).toBe('insufficient_coverage');
    expect(
      calculateRecordedMomentum([row('a', 4, 1)], daysAgo(14), 'refreshed_within_current7', now)
        .state,
    ).toBe('available');
  });

  it('returns no directional lists when coverage exists but current7 capture is stale', () => {
    expect(
      calculateRecordedMomentum([row('a', 0, 8)], daysAgo(30), 'stale_for_current7', now),
    ).toEqual({ state: 'stale_data', increased: [], decreased: [] });
  });

  it('calculates deltas and enforces +2/-2 eligibility', () => {
    const result = calculateRecordedMomentum(
      [row('up', 3, 1), row('up-noise', 2, 1), row('down', 0, 2), row('down-noise', 0, 1)],
      daysAgo(30),
      'refreshed_within_current7',
      now,
    );
    expect(result.state).toBe('available');
    if (result.state !== 'available') return;
    expect(result.increased.map(({ artistId, delta }) => ({ artistId, delta }))).toEqual([
      { artistId: 'up', delta: 2 },
    ]);
    expect(result.decreased.map(({ artistId, delta }) => ({ artistId, delta }))).toEqual([
      { artistId: 'down', delta: -2 },
    ]);
  });

  it('sorts deterministically and caps each direction at five', () => {
    const result = calculateRecordedMomentum(
      [
        row('z', 5, 1),
        row('a', 5, 1),
        row('b', 6, 2),
        row('c', 4, 1),
        row('d', 4, 1),
        row('e', 4, 1),
        row('down-z', 0, 4),
        row('down-a', 0, 4),
        row('down-b', 1, 5),
        row('down-c', 0, 3),
        row('down-d', 0, 3),
        row('down-e', 0, 3),
      ],
      daysAgo(30),
      'refreshed_within_current7',
      now,
    );
    if (result.state !== 'available') throw new Error('expected available momentum');
    expect(result.increased.map((item) => item.artistId)).toEqual(['b', 'a', 'z', 'c', 'd']);
    expect(result.decreased.map((item) => item.artistId)).toEqual([
      'down-b',
      'down-a',
      'down-z',
      'down-c',
      'down-d',
    ]);
  });

  it('returns a truthful available empty state when no artist qualifies', () => {
    expect(
      calculateRecordedMomentum([row('a', 2, 1)], daysAgo(30), 'refreshed_within_current7', now),
    ).toEqual({ state: 'available', increased: [], decreased: [] });
  });

  it('keeps zero current7 events factual after a recent successful sync', () => {
    const result = calculateRecordedMomentum(
      [row('a', 0, 3)],
      daysAgo(30),
      'refreshed_within_current7',
      now,
    );
    expect(result.state).toBe('available');
    if (result.state !== 'available') return;
    expect(result.decreased[0]).toMatchObject({
      artistId: 'a',
      current7RecordedCount: 0,
      previous7RecordedCount: 3,
      delta: -3,
    });
  });
});
