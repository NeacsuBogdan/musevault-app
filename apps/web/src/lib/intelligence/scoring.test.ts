import { describe, expect, it } from 'vitest';

import { collectRediscoverSignals } from './signals';
import {
  calculateAffinityPressure,
  calculateAgeRelevance,
  calculateEvidenceLevel,
  calculateLibraryAgeDepth,
  calculateRecordedFrequencyPressure,
  calculateRecordedRecencyPressure,
  calculateRediscoverIntelligence,
  calculateVaultDepth,
} from './scoring';

const now = new Date('2026-09-05T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

function signals(overrides: Partial<Parameters<typeof collectRediscoverSignals>[0]> = {}) {
  return collectRediscoverSignals({
    savedAt: daysAgo(1_095),
    now,
    latestRecordedPlayAt: null,
    recordedPlayCount7d: 0,
    recordedPlayCount30d: 0,
    recordedPlayCount90d: 0,
    recordedListeningCoverage: false,
    recentRecordedEventsAvailable: false,
    affinity: {
      shortTerm: { snapshotAvailable: false, rank: null },
      mediumTerm: { snapshotAvailable: false, rank: null },
      longTerm: { snapshotAvailable: false, rank: null },
    },
    ...overrides,
  });
}

describe('Rediscover Score v2', () => {
  it.each([
    [90, 25],
    [180, 35],
    [365, 50],
    [730, 65],
    [1_095, 78],
    [1_825, 90],
    [2_920, 100],
  ])('preserves the %i-day age anchor at %i', (days, expected) => {
    expect(calculateAgeRelevance(days)).toBe(expected);
  });

  it('interpolates deterministically between age anchors', () => {
    expect(calculateAgeRelevance(135)).toBe(30);
    expect(calculateAgeRelevance(1_460)).toBe(84);
    expect(calculateAgeRelevance(2_000)).toBe(92);
  });

  it('is monotonic across the eligible age range', () => {
    const values = Array.from({ length: 2_831 }, (_, index) => calculateAgeRelevance(index + 90));
    expect(values.every((value, index) => index === 0 || value >= values[index - 1]!)).toBe(true);
  });

  it('clamps age relevance and the final score to 0..100', () => {
    expect(calculateAgeRelevance(89)).toBe(0);
    expect(calculateAgeRelevance(90)).toBe(25);
    expect(calculateAgeRelevance(2_920)).toBe(100);
    expect(calculateAgeRelevance(9_000)).toBe(100);
    expect(
      calculateRediscoverIntelligence(signals({ savedAt: daysAgo(9_000) })).rediscoverScore,
    ).toBe(100);
    expect(
      calculateRediscoverIntelligence(
        signals({
          savedAt: daysAgo(90),
          latestRecordedPlayAt: daysAgo(1),
          recordedPlayCount7d: 100,
          recordedPlayCount30d: 100,
          recordedPlayCount90d: 100,
          affinity: {
            shortTerm: { snapshotAvailable: true, rank: 1 },
            mediumTerm: { snapshotAvailable: true, rank: 1 },
            longTerm: { snapshotAvailable: true, rank: 1 },
          },
        }),
      ).rediscoverScore,
    ).toBe(0);
  });

  it('discriminates between substantially different old ages without changing pressure', () => {
    const younger = calculateRediscoverIntelligence(signals({ savedAt: daysAgo(1_900) }));
    const older = calculateRediscoverIntelligence(signals({ savedAt: daysAgo(2_700) }));
    expect(older.rediscoverScore).toBeGreaterThan(younger.rediscoverScore);
    expect(older.scoreComponents.slice(1)).toEqual(younger.scoreComponents.slice(1));
  });

  it('reduces relevance for a recent recorded play and repeated recent rotation', () => {
    const baseline = calculateRediscoverIntelligence(signals()).rediscoverScore;
    const recent = calculateRediscoverIntelligence(
      signals({ latestRecordedPlayAt: daysAgo(5) }),
    ).rediscoverScore;
    const repeated = calculateRediscoverIntelligence(
      signals({
        latestRecordedPlayAt: daysAgo(5),
        recordedPlayCount7d: 3,
        recordedPlayCount30d: 5,
        recordedPlayCount90d: 8,
      }),
    ).rediscoverScore;
    expect(recent).toBeLessThan(baseline);
    expect(repeated).toBeLessThan(recent);
  });

  it('retains the bounded recorded-recency and frequency pressure semantics', () => {
    expect([
      calculateRecordedRecencyPressure(null),
      calculateRecordedRecencyPressure(7),
      calculateRecordedRecencyPressure(30),
      calculateRecordedRecencyPressure(90),
      calculateRecordedRecencyPressure(180),
      calculateRecordedRecencyPressure(181),
    ]).toEqual([0, 38, 30, 18, 10, 4]);
    expect(
      calculateRecordedFrequencyPressure({
        recordedPlayCount7d: 100,
        recordedPlayCount30d: 100,
        recordedPlayCount90d: 100,
      }),
    ).toBe(30);
  });

  it('makes short-term affinity strongest, medium smaller, and long-term mild', () => {
    expect(calculateAffinityPressure(1, 'shortTerm')).toBe(34);
    expect(calculateAffinityPressure(1, 'mediumTerm')).toBe(16);
    expect(calculateAffinityPressure(1, 'longTerm')).toBe(7);
    expect(
      calculateRediscoverIntelligence(
        signals({
          savedAt: daysAgo(1_825),
          affinity: {
            shortTerm: { snapshotAvailable: false, rank: null },
            mediumTerm: { snapshotAvailable: false, rank: null },
            longTerm: { snapshotAvailable: true, rank: 1 },
          },
        }),
      ).rediscoverScore,
    ).toBe(83);
  });

  it('gives no fake positive relevance for missing play history or affinity', () => {
    const unknown = calculateRediscoverIntelligence(signals()).rediscoverScore;
    const observedAbsence = calculateRediscoverIntelligence(
      signals({
        recordedListeningCoverage: true,
        affinity: {
          shortTerm: { snapshotAvailable: true, rank: null },
          mediumTerm: { snapshotAvailable: true, rank: null },
          longTerm: { snapshotAvailable: true, rank: null },
        },
      }),
    ).rediscoverScore;
    expect(unknown).toBe(observedAbsence);
  });

  it('is deterministic for identical evidence', () => {
    expect(calculateRediscoverIntelligence(signals())).toEqual(
      calculateRediscoverIntelligence(signals()),
    );
  });
});

describe('Evidence Level', () => {
  it('is low when only library age is known', () =>
    expect(calculateEvidenceLevel(signals())).toBe('low'));

  it('keeps strong contextual coverage without direct track evidence at Medium', () => {
    expect(
      calculateEvidenceLevel(
        signals({
          recordedListeningCoverage: true,
          affinity: {
            shortTerm: { snapshotAvailable: true, rank: null },
            mediumTerm: { snapshotAvailable: true, rank: null },
            longTerm: { snapshotAvailable: true, rank: null },
          },
        }),
      ),
    ).toBe('medium');
  });

  it('does not treat absence from one captured short-term snapshot as direct evidence', () => {
    expect(
      calculateEvidenceLevel(
        signals({
          affinity: {
            shortTerm: { snapshotAvailable: true, rank: null },
            mediumTerm: { snapshotAvailable: false, rank: null },
            longTerm: { snapshotAvailable: false, rank: null },
          },
        }),
      ),
    ).toBe('low');
  });

  it('raises one direct per-track evidence family to Medium', () => {
    expect(
      calculateEvidenceLevel(
        signals({
          affinity: {
            shortTerm: { snapshotAvailable: false, rank: null },
            mediumTerm: { snapshotAvailable: true, rank: 10 },
            longTerm: { snapshotAvailable: false, rank: null },
          },
        }),
      ),
    ).toBe('medium');
  });

  it('uses High only for multiple direct families or strong direct evidence with context', () => {
    expect(
      calculateEvidenceLevel(
        signals({
          affinity: {
            shortTerm: { snapshotAvailable: false, rank: null },
            mediumTerm: { snapshotAvailable: true, rank: 10 },
            longTerm: { snapshotAvailable: true, rank: 20 },
          },
        }),
      ),
    ).toBe('high');
    expect(
      calculateEvidenceLevel(
        signals({
          recordedListeningCoverage: true,
          latestRecordedPlayAt: daysAgo(120),
          affinity: {
            shortTerm: { snapshotAvailable: true, rank: null },
            mediumTerm: { snapshotAvailable: true, rank: null },
            longTerm: { snapshotAvailable: false, rank: null },
          },
        }),
      ),
    ).toBe('high');
  });
});

describe('Vault Depth', () => {
  it('is deterministic, bounded, and becomes deeper with library age', () => {
    const younger = calculateVaultDepth(signals({ savedAt: daysAgo(1_900) }));
    const older = calculateVaultDepth(signals({ savedAt: daysAgo(2_700) }));
    expect(older.score).toBeGreaterThan(younger.score);
    expect(older.score).toBeLessThanOrEqual(100);
    expect(calculateVaultDepth(signals())).toEqual(calculateVaultDepth(signals()));
  });

  it('uses the same deterministic interpolation primitive with Vault Depth anchors', () => {
    expect(calculateLibraryAgeDepth(90)).toBe(15);
    expect(calculateLibraryAgeDepth(1_460)).toBe(60);
    expect(calculateLibraryAgeDepth(2_920)).toBe(70);
  });

  it('does not treat missing listening or snapshots as evidence of inactivity', () => {
    const unknown = calculateVaultDepth(signals());
    expect(
      unknown.components.find((component) => component.key === 'recorded_inactivity_depth')?.value,
    ).toBe(0);
    expect(
      unknown.components.find((component) => component.key === 'captured_affinity_depth')?.value,
    ).toBe(0);
  });

  it('remains a separate model from Rediscover Score', () => {
    const input = signals({
      recordedListeningCoverage: true,
      latestRecordedPlayAt: daysAgo(400),
      affinity: {
        shortTerm: { snapshotAvailable: true, rank: null },
        mediumTerm: { snapshotAvailable: true, rank: null },
        longTerm: { snapshotAvailable: true, rank: null },
      },
    });
    const intelligence = calculateRediscoverIntelligence(input);
    expect(intelligence.vaultDepth).not.toBe(intelligence.rediscoverScore);
  });
});
