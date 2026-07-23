import { describe, expect, it } from 'vitest';

import { normalizeSpotifyProfile, normalizeSpotifySavedTracks } from './normalize';
import { spotifyProfileResponseSchema, spotifySavedTracksResponseSchema } from './schemas';

describe('Spotify response normalization', () => {
  it('returns only the saved-track fields used by MuseVault', () => {
    const response = spotifySavedTracksResponseSchema.parse({
      href: 'https://api.spotify.com/v1/me/tracks?offset=0&limit=50',
      items: [
        {
          added_at: '2026-07-01T12:34:56Z',
          track: {
            album: {
              album_type: 'album',
              images: [
                {
                  height: 640,
                  url: 'https://i.scdn.co/image/cover-image',
                  width: 640,
                },
              ],
              name: 'A Test Album',
            },
            artists: [
              { id: 'artist-1', name: 'First Artist' },
              { id: 'artist-2', name: 'Second Artist' },
            ],
            duration_ms: 215_000,
            explicit: true,
            external_urls: {
              spotify: 'https://open.spotify.com/track/track-1',
            },
            id: 'track-1',
            name: 'A Test Track',
            popularity: 99,
          },
        },
      ],
      limit: 50,
      next: null,
      offset: 0,
      previous: null,
      total: 1,
    });

    expect(normalizeSpotifySavedTracks(response)).toEqual({
      items: [
        {
          albumImageUrl: 'https://i.scdn.co/image/cover-image',
          albumName: 'A Test Album',
          artistNames: ['First Artist', 'Second Artist'],
          durationMs: 215_000,
          explicit: true,
          id: 'track-1',
          name: 'A Test Track',
          savedAt: '2026-07-01T12:34:56Z',
          spotifyUrl: 'https://open.spotify.com/track/track-1',
        },
      ],
      limit: 50,
      offset: 0,
      total: 1,
    });
  });

  it('uses safe profile fallbacks and drops unsupported image hosts', () => {
    const profile = spotifyProfileResponseSchema.parse({
      account_id: 'stable-account-id',
      display_name: null,
      images: [{ url: 'https://example.com/profile.jpg' }],
      product: 'premium',
    });

    expect(normalizeSpotifyProfile(profile)).toEqual({
      accountId: 'stable-account-id',
      displayName: 'Spotify listener',
      imageUrl: null,
    });
  });

  it('rejects a malformed saved-track response', () => {
    expect(() =>
      spotifySavedTracksResponseSchema.parse({
        items: [
          {
            added_at: 'not-a-date',
            track: {},
          },
        ],
        limit: 50,
        offset: 0,
        total: 1,
      }),
    ).toThrow();
  });
});
