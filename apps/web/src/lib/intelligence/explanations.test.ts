import { describe, expect, it } from 'vitest';

import { buildRediscoverReasons } from './explanations';
import { calculateEvidenceLevel } from './scoring';
import { collectRediscoverSignals } from './signals';

const now = new Date('2026-09-05T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);
const reasons = (overrides: Partial<Parameters<typeof collectRediscoverSignals>[0]> = {}) => {
  const signals = collectRediscoverSignals({
    savedAt: daysAgo(1_825),
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
  return buildRediscoverReasons(signals, calculateEvidenceLevel(signals));
};

describe('Rediscover explanations', () => {
  it('always grounds saved-age copy in persisted library evidence', () => {
    expect(reasons()[0]).toEqual({
      code: 'saved_age',
      text: 'Saved 5+ years ago',
      evidenceSource: 'library',
    });
  });

  it('keeps old-age wording factual while distinguishing different ages', () => {
    expect(reasons({ savedAt: daysAgo(2_700) })[0]?.text).toBe('Saved 7+ years ago');
  });

  it('uses recorded-play recency only when an actual event exists', () => {
    expect(
      reasons({
        latestRecordedPlayAt: daysAgo(120),
        recordedListeningCoverage: true,
        recentRecordedEventsAvailable: true,
      })[0]?.text,
    ).toBe('Latest MuseVault-recorded play was 4 months ago');
    expect(reasons()).toHaveLength(1);
  });

  it('uses bare short-term absence only as a low-evidence fallback', () => {
    expect(
      reasons({
        affinity: {
          shortTerm: { snapshotAvailable: true, rank: null },
          mediumTerm: { snapshotAvailable: false, rank: null },
          longTerm: { snapshotAvailable: false, rank: null },
        },
      })[1]?.code,
    ).toBe('outside_short_term_affinity');
    expect(reasons()[1]).toBeUndefined();
  });

  it('prioritizes a longer-term to short-term affinity transition over generic age', () => {
    expect(
      reasons({
        affinity: {
          shortTerm: { snapshotAvailable: true, rank: null },
          mediumTerm: { snapshotAvailable: true, rank: null },
          longTerm: { snapshotAvailable: true, rank: 2 },
        },
      })[0],
    ).toMatchObject({
      code: 'longer_term_affinity_transition',
      text: 'Captured as a longer-term favorite, but not in your latest short-term affinity',
    });
  });

  it('uses direct medium-term affinity context when no transition is observable', () => {
    expect(
      reasons({
        affinity: {
          shortTerm: { snapshotAvailable: false, rank: null },
          mediumTerm: { snapshotAvailable: true, rank: 12 },
          longTerm: { snapshotAvailable: false, rank: null },
        },
      })[0]?.code,
    ).toBe('medium_term_affinity');
  });

  it('bounds explanations while keeping recorded-play evidence first', () => {
    const result = reasons({
      latestRecordedPlayAt: daysAgo(120),
      recordedListeningCoverage: true,
      recentRecordedEventsAvailable: true,
      affinity: {
        shortTerm: { snapshotAvailable: true, rank: null },
        mediumTerm: { snapshotAvailable: true, rank: 4 },
        longTerm: { snapshotAvailable: true, rank: 8 },
      },
    });
    expect(result).toHaveLength(2);
    expect(result[0]?.code).toBe('recorded_play_recency');
    expect(result[1]?.code).toBe('longer_term_affinity_transition');
  });

  it('contains no claims of complete listening knowledge', () => {
    const copy = reasons({
      latestRecordedPlayAt: daysAgo(400),
      recordedListeningCoverage: true,
      recentRecordedEventsAvailable: true,
    })
      .map(({ text }) => text)
      .join(' ')
      .toLowerCase();
    expect(copy).not.toMatch(/never listened|you forgot|you haven't listened|spotify says/);
  });
});
