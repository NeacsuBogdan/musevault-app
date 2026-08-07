import { describe, expect, it } from 'vitest';

import {
  FULL_LIBRARY_SYNC_PAGE_LIMIT,
  FULL_LIBRARY_SYNC_PAGES_PER_REQUEST,
  isFullLibraryPageComplete,
  prepareFullLibraryPage,
} from './library-sync';
import type { SavedTrack } from '@/types/spotify';

const track: SavedTrack = {
  albumId: 'album-1',
  albumImageUrl: 'https://i.scdn.co/image/album-1',
  albumName: 'Album',
  artistIds: ['artist-1', 'artist-2'],
  artistNames: ['First', 'Second'],
  durationMs: 180_000,
  explicit: false,
  id: 'track-1',
  name: 'Track',
  savedAt: '2026-08-01T10:00:00Z',
  spotifyUrl: 'https://open.spotify.com/track/track-1',
};

describe('full library sync pagination', () => {
  it('keeps each HTTP step bounded', () => {
    expect(FULL_LIBRARY_SYNC_PAGE_LIMIT).toBe(50);
    expect(FULL_LIBRARY_SYNC_PAGES_PER_REQUEST).toBe(3);
  });

  it('continues after a full page when Spotify reports more tracks', () => {
    expect(
      isFullLibraryPageComplete({ items: Array.from({ length: 50 }), offset: 100, total: 500 }),
    ).toBe(false);
  });

  it('finishes on a short page, empty page, or the reported total', () => {
    expect(isFullLibraryPageComplete({ items: [1], offset: 50, total: 500 })).toBe(true);
    expect(isFullLibraryPageComplete({ items: [], offset: 500, total: 500 })).toBe(true);
    expect(
      isFullLibraryPageComplete({ items: Array.from({ length: 50 }), offset: 50, total: 100 }),
    ).toBe(true);
  });
});

describe('full library page persistence planning', () => {
  it('deduplicates entities and preserves artist order and membership markers', () => {
    const now = new Date('2026-08-08T10:00:00Z');
    const prepared = prepareFullLibraryPage([track, track], 'sync-1', 'user-1', now);

    expect(prepared.albums).toHaveLength(1);
    expect(prepared.artists).toHaveLength(2);
    expect(prepared.tracks).toHaveLength(1);
    expect(prepared.memberships).toEqual([
      expect.objectContaining({
        lastSeenSyncId: 'sync-1',
        savedAt: new Date(track.savedAt),
        trackId: 'track-1',
        userId: 'user-1',
      }),
    ]);
    expect(prepared.relationships.slice(0, 2)).toEqual([
      { artistId: 'artist-1', position: 0, trackId: 'track-1' },
      { artistId: 'artist-2', position: 1, trackId: 'track-1' },
    ]);
  });
});
