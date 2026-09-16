import { describe, expect, it } from 'vitest';

import { BOUNDED_SOUND_FEATURES } from '@/lib/intelligence';

import { buildSoundEvolution, buildSoundPeriodEvidence } from './sound';

const center = (value: number) =>
  Object.fromEntries(BOUNDED_SOUND_FEATURES.map((feature) => [feature, value]));

function evidence(
  overrides: Parameters<typeof buildSoundPeriodEvidence>[0] = {
    totalCapturedEvents: 40,
    coveredCapturedEvents: 30,
    totalUniqueCapturedTracks: 20,
    coveredUniqueCapturedTracks: 15,
    activeCapturedListeningDays: 4,
    center: center(0.5),
  },
) {
  return buildSoundPeriodEvidence(overrides);
}

describe('Captured Listening Sound Center evidence', () => {
  it('calculates event and unique-track coverage independently without imputation', () => {
    const result = evidence({
      totalCapturedEvents: 8,
      coveredCapturedEvents: 6,
      totalUniqueCapturedTracks: 5,
      coveredUniqueCapturedTracks: 2,
      activeCapturedListeningDays: 2,
      center: { ...center(0.4), valence: null },
    });
    expect(result.eventCoveragePercentage).toBe(75);
    expect(result.uniqueTrackCoveragePercentage).toBe(40);
    expect(result.center).toBeNull();
  });

  it('requires every one of the seven bounded dimensions and no tempo or loudness', () => {
    const result = evidence();
    expect(Object.keys(result.center ?? {})).toEqual(BOUNDED_SOUND_FEATURES);
    expect(result.center).not.toHaveProperty('tempo');
    expect(result.center).not.toHaveProperty('loudness');
  });
});

describe('Sound Evolution availability and movement', () => {
  it.each([
    ['covered events', { coveredCapturedEvents: 19 }, 'CURRENT_TOO_FEW_COVERED_EVENTS'],
    ['covered tracks', { coveredUniqueCapturedTracks: 9 }, 'CURRENT_TOO_FEW_COVERED_TRACKS'],
    ['active days', { activeCapturedListeningDays: 2 }, 'CURRENT_TOO_FEW_ACTIVE_DAYS'],
    [
      'event coverage',
      { totalCapturedEvents: 50, coveredCapturedEvents: 24 },
      'CURRENT_EVENT_COVERAGE_TOO_LOW',
    ],
  ] as const)('rejects a current period below the %s threshold', (_label, override, reason) => {
    const current = evidence({
      totalCapturedEvents: 40,
      coveredCapturedEvents: 30,
      totalUniqueCapturedTracks: 20,
      coveredUniqueCapturedTracks: 15,
      activeCapturedListeningDays: 4,
      center: center(0.5),
      ...override,
    });
    const result = buildSoundEvolution(current, evidence());
    expect(result.available).toBe(false);
    expect(result.reasons).toContain(reason);
    expect(result.movement).toBeNull();
  });

  it('applies exact seven-dimensional RMS geometry, clamp, and rounding', () => {
    const current = evidence({
      totalCapturedEvents: 20,
      coveredCapturedEvents: 20,
      totalUniqueCapturedTracks: 10,
      coveredUniqueCapturedTracks: 10,
      activeCapturedListeningDays: 3,
      center: center(1),
    });
    const previous = evidence({
      totalCapturedEvents: 20,
      coveredCapturedEvents: 20,
      totalUniqueCapturedTracks: 10,
      coveredUniqueCapturedTracks: 10,
      activeCapturedListeningDays: 3,
      center: center(0),
    });
    const result = buildSoundEvolution(current, previous);
    expect(result.available).toBe(true);
    expect(result.movement).toBe(100);
  });

  it('returns at most three factual shifts using the fixed dimension tie order', () => {
    const currentCenter = center(0.5);
    currentCenter.energy = 0.8;
    currentCenter.valence = 0.2;
    currentCenter.danceability = 0.8;
    const result = buildSoundEvolution(
      evidence({
        totalCapturedEvents: 30,
        coveredCapturedEvents: 30,
        totalUniqueCapturedTracks: 15,
        coveredUniqueCapturedTracks: 15,
        activeCapturedListeningDays: 4,
        center: currentCenter,
      }),
      evidence(),
    );
    expect(result.available).toBe(true);
    if (!result.available) throw new Error('expected available sound comparison');
    expect(result.strongestShifts.map(({ feature, direction }) => [feature, direction])).toEqual([
      ['energy', 'higher'],
      ['valence', 'lower'],
      ['danceability', 'higher'],
    ]);
  });
});
