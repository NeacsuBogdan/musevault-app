import { describe, expect, it } from 'vitest';

import type { PersistedDashboardInput } from './dashboard-view-model';
import {
  createDashboardProfile,
  createDashboardViewModel,
  formatDashboardDuration,
} from './dashboard-view-model';

const profile = { displayName: 'Alex Morgan', imageUrl: 'https://i.scdn.co/image/profile' };
function snapshot(overrides: Partial<PersistedDashboardInput> = {}): PersistedDashboardInput {
  return {
    analytics: {
      topArtists: [],
      topAlbums: [],
      savedTimeline: [],
      explicitTrackCount: 0,
      nonExplicitTrackCount: 1200,
      durationBuckets: {
        under2Minutes: 0,
        twoTo3Minutes: 0,
        threeTo4Minutes: 1200,
        fourTo5Minutes: 0,
        fiveMinutesOrMore: 0,
      },
      firstSavedAt: '2012-01-01T00:00:00.000Z',
      latestSavedAt: '2026-08-08T12:00:00.000Z',
    },
    lastSuccessfulSyncAt: '2026-08-08T12:00:00.000Z',
    latestFullSyncAt: '2026-08-01T12:00:00.000Z',
    recentlySaved: [],
    savedTrackCount: 1200,
    totalDurationMs: 360_000_000,
    uniqueArtistCount: 400,
    ...overrides,
  };
}
function values(input: PersistedDashboardInput) {
  return Object.fromEntries(
    createDashboardViewModel(profile, input).statistics.map((item) => [item.label, item.value]),
  );
}

describe('persisted dashboard view model', () => {
  it('uses whole-library aggregates and computes average duration', () => {
    expect(values(snapshot())).toEqual({
      'Liked Songs': '1,200',
      Artists: '400',
      'Library Duration': '100h',
      'Average Track Length': '5m',
    });
  });

  it('represents a completed empty library successfully and zero-safely', () => {
    const model = createDashboardViewModel(
      profile,
      snapshot({ savedTrackCount: 0, totalDurationMs: 0, uniqueArtistCount: 0 }),
    );
    expect(model.recentlySaved).toEqual([]);
    expect(Object.fromEntries(model.statistics.map((item) => [item.label, item.value]))).toEqual({
      'Liked Songs': '0',
      Artists: '0',
      'Library Duration': '0m',
      'Average Track Length': '0m',
    });
  });

  it('keeps only five recent tracks and sanitizes unsafe URLs', () => {
    const tracks = Array.from({ length: 6 }, (_, index) => ({
      albumImageUrl: index === 0 ? 'https://example.com/image' : 'https://i.scdn.co/image/album',
      albumName: 'Album',
      artistNames: ['Artist'],
      durationMs: 1,
      explicit: false,
      id: `track-${index}`,
      name: 'Track',
      savedAt: '2026-08-08T12:00:00Z',
      spotifyUrl:
        index === 0 ? 'https://example.com/track' : `https://open.spotify.com/track/${index}`,
    }));
    const model = createDashboardViewModel(profile, snapshot({ recentlySaved: tracks }));
    expect(model.recentlySaved).toHaveLength(5);
    expect(model.recentlySaved[0]).toMatchObject({ albumImageUrl: null, spotifyUrl: null });
  });

  it('presents real analytics counts, preserves timeline values, and sanitizes album images', () => {
    const model = createDashboardViewModel(
      profile,
      snapshot({
        analytics: {
          ...snapshot().analytics,
          topArtists: [{ id: 'artist-1', name: 'Artist', savedTrackCount: 8 }],
          topAlbums: [
            { id: 'album-1', name: 'Album', imageUrl: 'https://bad.example/a', savedTrackCount: 5 },
          ],
          savedTimeline: [{ year: 2024, savedTrackCount: 3, cumulativeTrackCount: 3 }],
          explicitTrackCount: 300,
          nonExplicitTrackCount: 900,
        },
      }),
    );
    expect(model.analytics.topArtists[0]).toMatchObject({ name: 'Artist', savedTrackCount: 8 });
    expect(model.analytics.topAlbums[0]).toMatchObject({ imageUrl: null, savedTrackCount: 5 });
    expect(model.analytics.savedTimeline).toEqual([
      { year: 2024, savedTrackCount: 3, cumulativeTrackCount: 3 },
    ]);
    expect(model.analytics.explicitPercentage).toBe(25);
  });

  it('keeps composition percentages finite for an empty library', () => {
    const emptyAnalytics = {
      ...snapshot().analytics,
      nonExplicitTrackCount: 0,
      durationBuckets: {
        under2Minutes: 0,
        twoTo3Minutes: 0,
        threeTo4Minutes: 0,
        fourTo5Minutes: 0,
        fiveMinutesOrMore: 0,
      },
      firstSavedAt: null,
      latestSavedAt: null,
    };
    const analytics = createDashboardViewModel(
      profile,
      snapshot({ savedTrackCount: 0, analytics: emptyAnalytics }),
    ).analytics;
    expect(
      [
        analytics.explicitPercentage,
        analytics.nonExplicitPercentage,
        ...analytics.durationBuckets.map((bucket) => bucket.percentage),
      ].every(Number.isFinite),
    ).toBe(true);
  });

  it('preserves profile fallback and safe image behavior', () => {
    expect(
      createDashboardProfile({ displayName: '  ', imageUrl: 'https://example.com/a' }),
    ).toEqual({
      displayName: 'Spotify listener',
      firstName: 'Spotify',
      imageUrl: null,
      initials: 'SL',
    });
  });

  it('contains no loaded-page preview statistics', () => {
    const labels = createDashboardViewModel(profile, snapshot()).statistics.map(
      (item) => item.label,
    );
    expect(labels).toEqual(['Liked Songs', 'Artists', 'Library Duration', 'Average Track Length']);
  });
});

describe('dashboard duration formatting', () => {
  it.each([
    [0, '0m'],
    [60_000, '1m'],
    [3_600_000, '1h'],
    [3_660_000, '1h 1m'],
    [-1, '0m'],
    [Number.NaN, '0m'],
  ] as const)('formats %s as %s', (duration, expected) => {
    expect(formatDashboardDuration(duration)).toBe(expected);
  });
});
