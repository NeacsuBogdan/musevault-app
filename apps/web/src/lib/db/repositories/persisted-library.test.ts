import { describe, expect, it } from 'vitest';

import {
  assemblePersistedSavedTracks,
  assembleSavedTimeline,
  classifyTrackDuration,
  parsePersistedLibraryPagination,
} from './persisted-library';

describe('persisted library pagination', () => {
  it('accepts bounded pagination', () => {
    expect(parsePersistedLibraryPagination({ limit: 50, offset: 100 })).toEqual({
      limit: 50,
      offset: 100,
    });
  });

  it('rejects unbounded and malformed pagination', () => {
    expect(() => parsePersistedLibraryPagination({ limit: 101, offset: 0 })).toThrow();
    expect(() => parsePersistedLibraryPagination({ limit: 50, offset: -1 })).toThrow();
    expect(() => parsePersistedLibraryPagination({ limit: 50, offset: 0, secret: true })).toThrow();
  });
});

describe('persisted saved-library analytics', () => {
  it('orders reduced UTC year rows cumulatively without fabricating years', () => {
    expect(
      assembleSavedTimeline([
        { year: 2022, savedTrackCount: 2 },
        { year: 2024, savedTrackCount: 3 },
      ]),
    ).toEqual([
      { year: 2022, savedTrackCount: 2, cumulativeTrackCount: 2 },
      { year: 2024, savedTrackCount: 3, cumulativeTrackCount: 5 },
    ]);
  });

  it('returns an empty timeline zero-safely', () => {
    expect(assembleSavedTimeline([])).toEqual([]);
  });

  it.each([
    [119_999, 'under2Minutes'],
    [120_000, 'twoTo3Minutes'],
    [180_000, 'threeTo4Minutes'],
    [240_000, 'fourTo5Minutes'],
    [300_000, 'fiveMinutesOrMore'],
  ] as const)('places duration boundary %i in %s', (durationMs, expected) => {
    expect(classifyTrackDuration(durationMs)).toBe(expected);
  });
});

describe('persisted recent tracks', () => {
  it('preserves track order and ordered artist names', () => {
    const savedAt = new Date('2026-08-08T12:00:00Z');
    const base = {
      albumImageUrl: null,
      albumName: 'Album',
      durationMs: 100,
      explicit: false,
      id: 'track-1',
      name: 'Track',
      savedAt,
      spotifyUrl: 'https://open.spotify.com/track/1',
    };
    expect(
      assemblePersistedSavedTracks([
        { ...base, artistName: 'First', position: 0 },
        { ...base, artistName: 'Second', position: 1 },
      ])[0]?.artistNames,
    ).toEqual(['First', 'Second']);
  });
});
