import { describe, expect, it } from 'vitest';
import { normalizeSpotifyRecentlyPlayed } from './normalize';
import { spotifyRecentlyPlayedResponseSchema } from './schemas';

function track() {
  return {
    id: 'track-1',
    name: 'Track',
    duration_ms: 180000,
    explicit: false,
    external_urls: { spotify: 'https://open.spotify.com/track/track-1' },
    album: { id: 'album-1', name: 'Album', images: [{ url: 'https://i.scdn.co/image/cover' }] },
    artists: [
      { id: 'artist-1', name: 'First' },
      { id: 'artist-2', name: 'Second' },
    ],
  };
}
function response(context: unknown = null) {
  return {
    items: [{ track: track(), played_at: '2026-08-12T10:15:30.000Z', context }],
    cursors: { after: '1770000000000', before: '1760000000000' },
    next: null,
  };
}

function parse(overrides: Record<string, unknown> = {}) {
  return normalizeSpotifyRecentlyPlayed(
    spotifyRecentlyPlayedResponseSchema.parse({ ...response(), ...overrides }),
  );
}

describe('Recently Played normalization', () => {
  it('normalizes a valid play, nullable context, timestamp, and credited artist order', () => {
    const normalized = normalizeSpotifyRecentlyPlayed(
      spotifyRecentlyPlayedResponseSchema.parse(response()),
    );
    expect(normalized.items[0]).toMatchObject({
      playedAt: '2026-08-12T10:15:30.000Z',
      context: null,
      track: {
        id: 'track-1',
        artistIds: ['artist-1', 'artist-2'],
        artistNames: ['First', 'Second'],
      },
    });
  });
  it('keeps safe Spotify context URLs and nullifies unsafe context URLs', () => {
    const safe = response({
      type: 'playlist',
      uri: 'spotify:playlist:1',
      external_urls: { spotify: 'https://open.spotify.com/playlist/1' },
    });
    expect(
      normalizeSpotifyRecentlyPlayed(spotifyRecentlyPlayedResponseSchema.parse(safe)).items[0]
        ?.context?.spotifyUrl,
    ).toBe('https://open.spotify.com/playlist/1');
    const unsafe = response({
      type: 'playlist',
      uri: 'spotify:playlist:1',
      external_urls: { spotify: 'https://attacker.example/playlist/1' },
    });
    expect(
      normalizeSpotifyRecentlyPlayed(spotifyRecentlyPlayedResponseSchema.parse(unsafe)).items[0]
        ?.context?.spotifyUrl,
    ).toBeNull();
  });
  it('rejects malformed Spotify responses', () => {
    expect(
      spotifyRecentlyPlayedResponseSchema.safeParse({ items: [{ played_at: 'bad' }] }).success,
    ).toBe(false);
  });

  it.each([
    ['normal cursors', { cursors: { after: '1770000000000', before: '1760000000000' } }],
    ['null cursors', { cursors: null }],
    ['missing cursors', { cursors: undefined }],
    ['null after', { cursors: { after: null, before: '1760000000000' } }],
    ['null before', { cursors: { after: '1770000000000', before: null } }],
    ['missing cursor fields', { cursors: {} }],
  ])('accepts %s', (_label, overrides) => {
    expect(() => parse(overrides)).not.toThrow();
  });

  it('normalizes absent cursors and next as a safely completed page', () => {
    const parsed = parse({ cursors: undefined, next: undefined });
    expect(parsed).toMatchObject({
      cursors: { after: null, before: null },
      hasNext: false,
    });
  });

  it('continues to reject malformed unrelated track data', () => {
    const malformed = response();
    malformed.items[0]!.track.id = '';
    expect(spotifyRecentlyPlayedResponseSchema.safeParse(malformed).success).toBe(false);
  });
});
