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
const ok = (value: unknown) => new Response(JSON.stringify(value), { status: 200 });

function requestedIds(fetch: ReturnType<typeof vi.spyOn>, callIndex: number) {
  const input = fetch.mock.calls[callIndex]?.[0];
  const url = new URL(
    typeof input === 'string' ? input : input instanceof Request ? input.url : '',
  );
  return url.searchParams.get('ids')?.split(',') ?? [];
}

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
    expect(fetch).toHaveBeenCalledTimes(2);
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

  it('confirms only Spotify IDs omitted by the first resolver response and merges recovery', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok([mapping()]))
      .mockResolvedValueOnce(ok([mapping(spotifyB, providerB)]))
      .mockResolvedValueOnce(ok([row(providerA), row(providerB)]));

    const result = await reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA, spotifyB]);

    expect(result.available.map((item) => item.spotifyTrackId)).toEqual([spotifyA, spotifyB]);
    expect(result.notFoundSpotifyTrackIds).toEqual([]);
    expect(requestedIds(fetch, 1)).toEqual([spotifyB]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('confirms missing only after two successful resolver omissions and does not retry again', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok([mapping()]))
      .mockResolvedValueOnce(ok([]))
      .mockResolvedValueOnce(ok([row(providerA)]));

    await expect(reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA, spotifyB])).resolves.toEqual({
      available: [expect.objectContaining({ spotifyTrackId: spotifyA })],
      notFoundSpotifyTrackIds: [spotifyB],
    });
    expect(requestedIds(fetch, 1)).toEqual([spotifyB]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([
    ['429', 'rate_limited'],
    ['network', 'provider_unavailable'],
    ['invalid_json', 'provider_invalid_response'],
    ['invalid_schema', 'provider_invalid_response'],
  ] as const)(
    'fails a %s resolver confirmation without returning missing IDs',
    async (kind, code) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok([mapping()]));
      if (kind === '429')
        fetch.mockResolvedValueOnce(
          new Response('', { status: 429, headers: { 'Retry-After': '9' } }),
        );
      else if (kind === 'network') fetch.mockRejectedValueOnce(new Error('offline'));
      else if (kind === 'invalid_json')
        fetch.mockResolvedValueOnce(new Response('invalid', { status: 200 }));
      else fetch.mockResolvedValueOnce(ok({ unexpected: true }));

      await expect(
        reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA, spotifyB]),
      ).rejects.toMatchObject({
        code,
        partialAvailable: [],
      });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(requestedIds(fetch, 1)).toEqual([spotifyB]);
    },
  );

  it('confirms only provider IDs omitted by the first feature response and merges recovery', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok([mapping(), mapping(spotifyB, providerB)]))
      .mockResolvedValueOnce(ok([row(providerA)]))
      .mockResolvedValueOnce(ok([row(providerB)]));

    const result = await reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA, spotifyB]);

    expect(result.available.map((item) => item.spotifyTrackId)).toEqual([spotifyA, spotifyB]);
    expect(result.notFoundSpotifyTrackIds).toEqual([]);
    expect(requestedIds(fetch, 2)).toEqual([providerB]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('confirms missing only after two successful feature omissions and does not fabricate values', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok([mapping(), mapping(spotifyB, providerB)]))
      .mockResolvedValueOnce(ok([row(providerA)]))
      .mockResolvedValueOnce(ok([row('unrequested-provider')]));

    await expect(reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA, spotifyB])).resolves.toEqual({
      available: [expect.objectContaining({ spotifyTrackId: spotifyA })],
      notFoundSpotifyTrackIds: [spotifyB],
    });
    expect(requestedIds(fetch, 2)).toEqual([providerB]);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('runs bounded track and feature confirmations sequentially', async () => {
    const responses = [
      ok([mapping()]),
      ok([mapping(spotifyB, providerB)]),
      ok([row(providerA)]),
      ok([row(providerB)]),
    ];
    let active = 0;
    let maximumActive = 0;
    let callIndex = 0;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      const response = responses[callIndex];
      callIndex += 1;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      if (!response) throw new Error('Unexpected extra attempt');
      return response;
    });

    await expect(reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA, spotifyB])).resolves.toEqual({
      available: [
        expect.objectContaining({ spotifyTrackId: spotifyA }),
        expect.objectContaining({ spotifyTrackId: spotifyB }),
      ],
      notFoundSpotifyTrackIds: [],
    });
    expect(maximumActive).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(requestedIds(fetch, 1)).toEqual([spotifyB]);
    expect(requestedIds(fetch, 3)).toEqual([providerB]);
  });

  it.each([
    ['429', 'rate_limited'],
    ['network', 'provider_unavailable'],
    ['invalid_json', 'provider_invalid_response'],
    ['invalid_schema', 'provider_invalid_response'],
  ] as const)(
    'preserves first-response features but returns no missing IDs after a %s feature confirmation',
    async (kind, code) => {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(ok([mapping(), mapping(spotifyB, providerB)]))
        .mockResolvedValueOnce(ok([row(providerA)]));
      if (kind === '429')
        fetch.mockResolvedValueOnce(
          new Response('', { status: 429, headers: { 'Retry-After': '9' } }),
        );
      else if (kind === 'network') fetch.mockRejectedValueOnce(new Error('offline'));
      else if (kind === 'invalid_json')
        fetch.mockResolvedValueOnce(new Response('invalid', { status: 200 }));
      else fetch.mockResolvedValueOnce(ok({ unexpected: true }));

      await expect(
        reccoBeatsProvider.loadForSpotifyTrackIds([spotifyA, spotifyB]),
      ).rejects.toMatchObject({
        code,
        partialAvailable: [expect.objectContaining({ spotifyTrackId: spotifyA })],
      });
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(requestedIds(fetch, 2)).toEqual([providerB]);
    },
  );

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
