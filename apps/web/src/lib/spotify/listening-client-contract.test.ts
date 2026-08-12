import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSpotifyRecentlyPlayed, getSpotifyTopArtists, getSpotifyTopTracks } from './client';

const track = {
  id: 'track-1',
  name: 'Track',
  duration_ms: 1,
  explicit: false,
  external_urls: { spotify: 'https://open.spotify.com/track/1' },
  album: { id: 'album-1', name: 'Album', images: [] },
  artists: [{ id: 'artist-1', name: 'Artist' }],
};
afterEach(() => vi.restoreAllMocks());
describe('Spotify listening API contract', () => {
  it('requests Recently Played with a maximum page and cursor', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [], cursors: { after: '123' }, next: null }), {
        status: 200,
      }),
    );
    await getSpotifyRecentlyPlayed('token', { limit: 50, after: 123 });
    expect(String(fetch.mock.calls[0]?.[0])).toContain(
      '/me/player/recently-played?limit=50&after=123',
    );
  });
  it('requests exactly 20 top tracks and artists for every supported range', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async (input) =>
          new Response(
            JSON.stringify(
              String(input).includes('/tracks')
                ? { items: [track] }
                : { items: [{ id: 'artist-1', name: 'Artist' }] },
            ),
            { status: 200 },
          ),
      );
    for (const range of ['short_term', 'medium_term', 'long_term'] as const) {
      await getSpotifyTopTracks('token', range);
      await getSpotifyTopArtists('token', range);
    }
    expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual([
      'https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=short_term',
      'https://api.spotify.com/v1/me/top/artists?limit=20&time_range=short_term',
      'https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=medium_term',
      'https://api.spotify.com/v1/me/top/artists?limit=20&time_range=medium_term',
      'https://api.spotify.com/v1/me/top/tracks?limit=20&time_range=long_term',
      'https://api.spotify.com/v1/me/top/artists?limit=20&time_range=long_term',
    ]);
  });
});
