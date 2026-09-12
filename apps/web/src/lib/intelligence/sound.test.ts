import { describe, expect, it } from 'vitest';

import {
  buildSoundDistanceReasons,
  calculateSoundDistance,
  calculateSoundDistribution,
  calculateSoundProfileCoverage,
  rankClosestToSoundCenter,
  rankSonicOutliers,
} from './sound';

const values = (value: number) => ({
  acousticness: value,
  danceability: value,
  energy: value,
  instrumentalness: value,
  liveness: value,
  speechiness: value,
  valence: value,
});

describe('sound profile coverage', () => {
  it.each([
    [0, 0, null, 'NO_DATA', 'LOW'],
    [100, 0, 0, 'NO_DATA', 'LOW'],
    [100, 1, 1, 'LIMITED_SAMPLE', 'LOW'],
    [100, 19, 19, 'LIMITED_SAMPLE', 'LOW'],
    [100, 20, 20, 'PROFILE_AVAILABLE', 'LOW'],
    [50, 49, 98, 'PROFILE_AVAILABLE', 'LOW'],
    [250, 50, 20, 'PROFILE_AVAILABLE', 'MEDIUM'],
    [334, 200, 59.9, 'PROFILE_AVAILABLE', 'MEDIUM'],
    [333, 200, 60.1, 'PROFILE_AVAILABLE', 'HIGH'],
    [500, 300, 60, 'PROFILE_AVAILABLE', 'HIGH'],
  ] as const)(
    'classifies %s saved and %s covered deterministically',
    (saved, covered, percent, availability, quality) => {
      expect(calculateSoundProfileCoverage(saved, covered)).toEqual({
        currentSavedTrackCount: saved,
        audioCoveredTrackCount: covered,
        audioCoveragePercent: percent,
        profileAvailability: availability,
        coverageQuality: quality,
      });
    },
  );

  it('uses the exact percentage rather than the displayed tenth for quality boundaries', () => {
    expect(calculateSoundProfileCoverage(249, 49)).toMatchObject({
      audioCoveragePercent: 19.7,
      coverageQuality: 'LOW',
    });
  });
});

describe('sound distributions', () => {
  it('matches PostgreSQL percentile_cont linear interpolation', () => {
    expect(calculateSoundDistribution([1, 0])).toEqual({ p25: 0.25, p50: 0.5, p75: 0.75 });
    expect(calculateSoundDistribution([0, 0.2, 0.4, 0.6, 0.8])).toEqual({
      p25: 0.2,
      p50: 0.4,
      p75: 0.6,
    });
  });

  it('returns unavailable percentiles for an empty sample and ignores non-finite values', () => {
    expect(calculateSoundDistribution([])).toEqual({ p25: null, p50: null, p75: null });
    expect(calculateSoundDistribution([Number.NaN, 0.4, Number.POSITIVE_INFINITY])).toEqual({
      p25: 0.4,
      p50: 0.4,
      p75: 0.4,
    });
  });

  it('keeps tempo and loudness values in their native numeric scales', () => {
    expect(calculateSoundDistribution([80, 100, 120])).toEqual({
      p25: 90,
      p50: 100,
      p75: 110,
    });
    expect(calculateSoundDistribution([-12, -8, -4, -2])).toEqual({
      p25: -9,
      p50: -6,
      p75: -3.5,
    });
  });
});

describe('Sound Distance', () => {
  it('uses equal-weight seven-dimensional RMS distance and rounds to an integer', () => {
    expect(calculateSoundDistance(values(0.5), values(0.5))).toBe(0);
    expect(calculateSoundDistance(values(1), values(0))).toBe(100);
    expect(calculateSoundDistance({ ...values(0), energy: 1 }, values(0))).toBe(38);
    expect(calculateSoundDistance(values(0.6), values(0.5))).toBe(10);
    expect(calculateSoundDistance({ ...values(0), energy: 1 }, values(0))).toBe(
      calculateSoundDistance({ ...values(0), valence: 1 }, values(0)),
    );
    expect(calculateSoundDistance(values(0.6), values(0.5))).toBe(
      calculateSoundDistance(values(0.6), values(0.5)),
    );
  });

  it('does not use tempo or loudness and rejects missing or unbounded values', () => {
    const trackWithNativeFeatures = { ...values(0.5), tempo: 220, loudness: -2 };
    const centerWithNativeFeatures = { ...values(0.5), tempo: 80, loudness: -20 };
    expect(calculateSoundDistance(trackWithNativeFeatures, centerWithNativeFeatures)).toBe(0);
    expect(calculateSoundDistance({ ...values(0.5), energy: null }, values(0.5))).toBeNull();
    expect(calculateSoundDistance({ ...values(0.5), valence: 1.01 }, values(0.5))).toBeNull();
  });

  it('returns at most two factual deviations with the fixed feature tie order', () => {
    expect(
      buildSoundDistanceReasons(
        { ...values(0.5), energy: 0.9, valence: 0.1, danceability: 0.9 },
        values(0.5),
      ),
    ).toEqual([
      { feature: 'energy', trackValue: 0.9, centerValue: 0.5, absoluteDifference: 0.4 },
      { feature: 'valence', trackValue: 0.1, centerValue: 0.5, absoluteDifference: 0.4 },
    ]);
    expect(buildSoundDistanceReasons({ ...values(0.5), energy: null }, values(0.5))).toEqual([]);
  });
});

describe('sound ranking bounds', () => {
  const rows = Array.from({ length: 14 }, (_, index) => ({
    trackId: `track-${String(index).padStart(2, '0')}`,
    soundDistance: index % 4,
  }));

  it('orders outliers descending, resolves ties by track ID, and caps at 10', () => {
    const ranked = rankSonicOutliers(rows);
    expect(ranked).toHaveLength(10);
    expect(ranked.slice(0, 4).map(({ trackId }) => trackId)).toEqual([
      'track-03',
      'track-07',
      'track-11',
      'track-02',
    ]);
  });

  it('orders closest tracks ascending, resolves ties by track ID, and caps at 5', () => {
    expect(rankClosestToSoundCenter(rows).map(({ trackId }) => trackId)).toEqual([
      'track-00',
      'track-04',
      'track-08',
      'track-12',
      'track-01',
    ]);
  });
});
