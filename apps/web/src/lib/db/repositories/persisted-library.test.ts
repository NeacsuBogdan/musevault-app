import { describe, expect, it } from 'vitest';

import { assemblePersistedSavedTracks, parsePersistedLibraryPagination } from './persisted-library';

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
