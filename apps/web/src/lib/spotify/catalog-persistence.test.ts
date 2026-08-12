import { describe, expect, it } from 'vitest';
import { prepareSpotifyCatalog } from './catalog-persistence';

describe('listening catalog preparation', () => {
  it('prepares an unsaved listening track without creating a saved membership', () => {
    const prepared = prepareSpotifyCatalog(
      [
        {
          id: 'track-1',
          albumId: 'album-1',
          spotifyUrl: 'https://open.spotify.com/track/1',
          name: 'Track',
          artistIds: ['artist-2', 'artist-1'],
          artistNames: ['Second', 'First'],
          albumName: 'Album',
          albumImageUrl: null,
          durationMs: 1,
          explicit: false,
        },
      ],
      new Date('2026-08-12T00:00:00Z'),
    );
    expect(prepared.relationships).toEqual([
      { trackId: 'track-1', artistId: 'artist-2', position: 0 },
      { trackId: 'track-1', artistId: 'artist-1', position: 1 },
    ]);
    expect(prepared).not.toHaveProperty('memberships');
  });
});
