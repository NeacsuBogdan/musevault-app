import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioFeatureProviderError } from './provider';
import { reccoBeatsProvider } from './reccobeats';

const spotifyA = 'spotify-a';
const spotifyB = 'spotify-b';
const providerA = 'provider-a';
const providerB = 'provider-b';
const row = (id: string, value = 0.5) => ({
  id,
  acousticness: value,
  danceability: value,
  energy: value,
  instrumentalness: value,
  liveness: value,
  loudness: -8,
  speechiness: value,
  tempo: 120,
  valence: value,
});
const mapping = (spotifyId = spotifyA, providerId = providerA) => ({
  id: providerId,
  href: `https://open.spotify.com/track/${spotifyId}`,
});

afterEach(() => vi.restoreAllMocks());

describe('ReccoBeats provider', () => {
  it('uses no API key or Authorization header and maps reversed results by identity', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: [mapping(), mapping(spotifyB, providerB)] }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([row(providerB), row(providerA)]), { status: 200 }),
      );
    const result = await reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA, spotifyB]);
    expect(result.available.map((item) => item.spotifyTrackId)).toEqual([spotifyB, spotifyA]);
    for (const call of fetch.mock.calls) {
      expect(call[1]?.headers).toEqual({ Accept: 'application/json' });
      expect(JSON.stringify(call[1])).not.toMatch(/Authorization|api.?key/i);
    }
  });

  it.each([0, 1])('accepts bounded feature value %s', async (value) => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([mapping()]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([row(providerA, value)]), { status: 200 }),
      );
    await expect(reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA])).resolves.toMatchObject({
      available: [{ energy: value, valence: value }],
    });
  });

  it('rejects batches larger than 20', async () => {
    await expect(
      reccoBeatsProvider.loadForSpotifyTrackIds(Array.from({ length: 21 }, (_, i) => `id-${i}`)),
    ).rejects.toMatchObject({ code: 'provider_invalid_request' });
  });

  it.each([
    [Number.NaN, 'energy'],
    [Number.POSITIVE_INFINITY, 'tempo'],
    [Number.NEGATIVE_INFINITY, 'loudness'],
  ] as const)('rejects non-finite values', async (value, field) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([mapping()]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ ...row(providerA), [field]: value }]), { status: 200 }),
      );
    await expect(reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA])).rejects.toMatchObject({
      code: 'provider_invalid_response',
    });
  });

  it.each([
    [400, 'provider_invalid_request'],
    [429, 'rate_limited'],
    [500, 'provider_unavailable'],
  ] as const)('maps HTTP %s safely', async (status, code) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('private-body', { status, headers: { 'Retry-After': '7' } }),
    );
    await expect(reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA])).rejects.toMatchObject({
      code,
      ...(status === 429 ? { retryAfter: 7 } : {}),
    });
  });

  it('does not treat an ambiguous batch 404 as individual not-found tracks', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    await expect(reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA])).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
  });

  it('marks only IDs omitted by a successful resolver response as not found', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([mapping()]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([row(providerA)]), { status: 200 }));
    await expect(reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA, spotifyB])).resolves.toEqual({
      available: [expect.objectContaining({ spotifyTrackId: spotifyA })],
      notFoundSpotifyTrackIds: [spotifyB],
    });
  });

  it.each(['network', 'json', 'schema'] as const)(
    'maps %s without leaking bodies',
    async (kind) => {
      const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      if (kind === 'network')
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('private-body'));
      else if (kind === 'json')
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          new Response('private-body', { status: 200 }),
        );
      else
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(
          new Response(JSON.stringify({ private: 'body' }), { status: 200 }),
        );
      await expect(reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA])).rejects.toBeInstanceOf(
        AudioFeatureProviderError,
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain('private-body');
    },
  );
});
