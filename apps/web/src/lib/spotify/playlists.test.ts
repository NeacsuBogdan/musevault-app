import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpotifyApiError } from './errors';
import {
  addItemsToPlaylist,
  createPrivatePlaylist,
  SpotifyPlaylistVisibilityError,
} from './playlists';

const playlistId = '0123456789ABCDEFGHIJKL';
const trackIds = ['2222222222222222222222', '1111111111111111111111'] as const;
const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
const accessToken = 'private-access-token';
const createdPlaylist = {
  id: playlistId,
  name: 'MuseVault — High Energy',
  public: false,
  external_urls: { spotify: playlistUrl },
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Spotify private playlist creation', () => {
  it('uses the current authenticated-user endpoint with public:false and safe output', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { ...createdPlaylist, owner: { id: 'private-spotify-user-id' } },
        { status: 201 },
      ),
    );

    await expect(
      createPrivatePlaylist(accessToken, '  MuseVault — High Energy  '),
    ).resolves.toEqual({ id: playlistId, name: createdPlaylist.name, url: playlistUrl });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.spotify.com/v1/me/playlists');
    expect(String(url)).not.toContain('/users/');
    expect(options).toMatchObject({
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      redirect: 'error',
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      name: createdPlaylist.name,
      description: 'Created with MuseVault from your saved Spotify library.',
      public: false,
    });
    expect(options?.body).toBe(
      JSON.stringify({
        name: createdPlaylist.name,
        description: 'Created with MuseVault from your saved Spotify library.',
        public: false,
      }),
    );
    expect(String(options?.body)).toContain('"public":false');
  });

  it('rejects public visibility with the validated remote playlist and no retry', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ ...createdPlaylist, public: true }, { status: 201 }),
    );

    const error = await createPrivatePlaylist(accessToken, createdPlaylist.name).catch(
      (failure: unknown) => failure,
    );
    expect(error).toBeInstanceOf(SpotifyPlaylistVisibilityError);
    expect(error).toMatchObject({
      playlist: { id: playlistId, name: createdPlaylist.name, url: playlistUrl },
    });
    expect(JSON.stringify(error)).not.toMatch(/private-access-token|private-spotify-user-id/);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each(['', '   ', 'a'.repeat(101), '\nName', 'Name\u0000', 'Name\u007f', 'Name\u009f'])(
    'rejects an invalid playlist name without contacting Spotify: %j',
    async (name) => {
      await expect(createPrivatePlaylist(accessToken, name)).rejects.toThrow(
        'Invalid playlist name.',
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    { ...createdPlaylist, id: '../unsafe' },
    { ...createdPlaylist, name: '' },
    { ...createdPlaylist, name: 'Bad\nName' },
    { ...createdPlaylist, public: null },
    { ...createdPlaylist, public: undefined },
    { ...createdPlaylist, external_urls: undefined },
  ])('rejects malformed create responses without replaying creation: %j', async (payload) => {
    fetchMock.mockResolvedValueOnce(Response.json(payload, { status: 201 }));

    await expect(createPrivatePlaylist(accessToken, createdPlaylist.name)).rejects.toMatchObject({
      kind: 'invalid_response',
      category: 'schema',
      status: 201,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    `http://open.spotify.com/playlist/${playlistId}`,
    `https://evil.example/playlist/${playlistId}`,
    `https://open.spotify.com.evil.example/playlist/${playlistId}`,
    `https://open.spotify.com@evil.example/playlist/${playlistId}`,
    `https://evil.example@open.spotify.com/playlist/${playlistId}`,
    `https://open.spotify.com:444/playlist/${playlistId}`,
    `https://open.spotify.com/playlist/${trackIds[0]}`,
    `https://open.spotify.com/track/${playlistId}`,
    `${playlistUrl}?redirect=https://evil.example`,
    `${playlistUrl}#fragment`,
    `${playlistUrl}/extra`,
    `javascript:alert(1)`,
  ])('rejects unsafe or mismatched returned playlist URLs: %s', async (url) => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ ...createdPlaylist, external_urls: { spotify: url } }, { status: 201 }),
    );

    await expect(createPrivatePlaylist(accessToken, createdPlaylist.name)).rejects.toMatchObject({
      kind: 'invalid_response',
      category: 'schema',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('Spotify playlist add-items', () => {
  it('uses the current items endpoint and preserves the exact track order', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ snapshot_id: 'opaque-snapshot' }));

    await expect(addItemsToPlaylist(accessToken, playlistId, trackIds)).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`https://api.spotify.com/v1/playlists/${playlistId}/items`);
    expect(String(url)).not.toContain('/tracks');
    expect(options).toMatchObject({ method: 'POST', redirect: 'error' });
    expect(JSON.parse(String(options?.body))).toEqual({
      uris: ['spotify:track:2222222222222222222222', 'spotify:track:1111111111111111111111'],
    });
  });

  it('adds the maximum 50 preview tracks in one request', async () => {
    const ids = Array.from({ length: 50 }, (_, index) => String(index).padStart(22, '0'));
    fetchMock.mockResolvedValueOnce(Response.json({ snapshot_id: 'opaque-snapshot' }));

    await addItemsToPlaylist(accessToken, playlistId, ids);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toEqual({
      uris: ids.map((id) => `spotify:track:${id}`),
    });
  });

  it.each([
    { id: '../unsafe', ids: trackIds },
    { id: playlistId, ids: [] },
    { id: playlistId, ids: Array.from({ length: 51 }, () => trackIds[0]) },
    { id: playlistId, ids: ['spotify:track:2222222222222222222222'] },
    { id: playlistId, ids: ['unsafe/track'] },
    { id: playlistId, ids: ['a'.repeat(21)] },
    { id: playlistId, ids: ['a'.repeat(23)] },
  ])('rejects invalid local IDs or bounds before a request: %j', async ({ id, ids }) => {
    await expect(addItemsToPlaylist(accessToken, id, ids)).rejects.toThrow(
      'Invalid playlist items.',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([{}, { snapshot_id: null }, { snapshot_id: '' }, { snapshot_id: 'bad\u0000' }])(
    'requires a valid add-items acknowledgment without retrying: %j',
    async (payload) => {
      fetchMock.mockResolvedValueOnce(Response.json(payload));

      await expect(addItemsToPlaylist(accessToken, playlistId, trackIds)).rejects.toMatchObject({
        kind: 'invalid_response',
        category: 'schema',
      });
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
});

describe.each([
  ['create', () => createPrivatePlaylist(accessToken, createdPlaylist.name)],
  ['add items', () => addItemsToPlaylist(accessToken, playlistId, trackIds)],
] as const)('Spotify %s failure handling', (_operationName, operation) => {
  it.each([
    { status: 401, kind: 'unauthorized', retryAfter: null },
    { status: 403, kind: 'forbidden', retryAfter: null },
    { status: 429, kind: 'rate_limited', retryAfter: 12 },
    { status: 500, kind: 'unavailable', retryAfter: null },
    { status: 503, kind: 'unavailable', retryAfter: null },
  ])('returns safe HTTP $status details without retrying', async ({ status, kind, retryAfter }) => {
    const response = Response.json(
      { error: 'private-spotify-error-body', token: accessToken },
      { status, headers: { 'Retry-After': '12' } },
    );
    const readBody = vi.spyOn(response, 'json');
    fetchMock.mockResolvedValueOnce(response);

    const result = operation();

    await expect(result).rejects.toBeInstanceOf(SpotifyApiError);
    await expect(result).rejects.toMatchObject({ kind, status, retryAfter, category: 'http' });
    expect(readBody).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledOnce();
    const error = await result.catch((failure: unknown) => failure);
    expect(JSON.stringify(error)).not.toMatch(/private-spotify-error-body|private-access-token/);
  });

  it('discards an unsafe Retry-After value', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 429, headers: { 'Retry-After': '-1;private-value' } }),
    );

    await expect(operation()).rejects.toMatchObject({ kind: 'rate_limited', retryAfter: null });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('does not replay an ambiguous network failure or leak its message', async () => {
    const output = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    fetchMock.mockRejectedValueOnce(new Error(`Authorization: Bearer ${accessToken}`));

    const result = operation();

    await expect(result).rejects.toMatchObject({
      kind: 'unavailable',
      category: 'network',
      status: null,
      message: 'Spotify is temporarily unavailable.',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(output).not.toHaveBeenCalled();
    const error = await result.catch((failure: unknown) => failure);
    expect(JSON.stringify(error)).not.toMatch(/Authorization|private-access-token/);
  });

  it('does not replay a timeout', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('Request timed out', 'TimeoutError'));

    await expect(operation()).rejects.toMatchObject({ kind: 'unavailable', category: 'network' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects invalid success JSON without replaying the write', async () => {
    fetchMock.mockResolvedValueOnce(new Response('private-invalid-response', { status: 201 }));

    await expect(operation()).rejects.toMatchObject({
      kind: 'invalid_response',
      category: 'json',
      status: 201,
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
