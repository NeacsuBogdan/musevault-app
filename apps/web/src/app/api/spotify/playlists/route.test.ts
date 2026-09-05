import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpotifyApiError } from '@/lib/spotify/errors';
import { SpotifyTokenRefreshError } from '@/lib/spotify/tokens';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  capability: vi.fn(),
  preview: vi.fn(),
  refresh: vi.fn(),
  enrichment: vi.fn(),
}));
vi.mock('@/lib/auth/session', () => ({ readSession: mocks.session }));
vi.mock('@/lib/env', () => ({ getServerEnv: () => ({ APP_URL: 'http://127.0.0.1:3000' }) }));
vi.mock('@/lib/db/repositories/spotify-playlist-export', () => ({
  getSpotifyPlaylistExportCapability: mocks.capability,
}));
vi.mock('@/lib/db/repositories/smart-playlists', () => ({
  getSmartPlaylistPreview: mocks.preview,
}));
vi.mock('@/lib/audio-features/enrichment', () => ({ processEnrichmentRequest: mocks.enrichment }));
vi.mock('@/lib/spotify/tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/spotify/tokens')>()),
  ensureFreshSpotifySession: mocks.refresh,
}));
import { POST } from './route';

const fetchMock = vi.fn<typeof fetch>();
const session = {
  accessToken: 'private-access-token',
  refreshToken: 'private-refresh-token',
  accountId: 'private-account-id',
  displayName: 'Listener',
  expiresAt: 2e12,
  imageUrl: null,
  version: 1 as const,
};
const playlistId = '3cEYpjA9oz9GiPac4AsH4n';
const trackIds = ['4iV5W9uYEdYUVa79Axb7Rh', '1301WleyT98MSxVHPZCA6M'];
const playlist = {
  id: playlistId,
  name: 'MuseVault test',
  url: `https://open.spotify.com/playlist/${playlistId}`,
};
const createBody = {
  id: playlistId,
  name: playlist.name,
  public: false,
  external_urls: { spotify: playlist.url },
};
const validBody = { name: '  MuseVault test  ', definition: { preset: 'high-energy' } };
function request(body: unknown = validBody, changedHeaders: Record<string, string> = {}) {
  return new Request('http://127.0.0.1:3000/api/spotify/playlists', {
    method: 'POST',
    headers: {
      origin: 'http://127.0.0.1:3000',
      host: '127.0.0.1:3000',
      'content-type': 'application/json',
      ...changedHeaders,
    },
    body: JSON.stringify(body),
  });
}
const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers });
function successfulWrites() {
  fetchMock.mockResolvedValueOnce(json(createBody, 201));
  fetchMock.mockResolvedValueOnce(json({ snapshot_id: 'snapshot' }, 201));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  mocks.session.mockResolvedValue(session);
  mocks.capability.mockResolvedValue(true);
  mocks.preview.mockResolvedValue({
    state: 'success',
    tracks: trackIds.map((trackId) => ({ trackId })),
  });
  mocks.refresh.mockImplementation(async (value) => value);
});
afterEach(() => vi.unstubAllGlobals());

describe('authenticated authoritative Spotify export', () => {
  it('rejects unauthenticated requests before database or Spotify access', async () => {
    mocks.session.mockResolvedValue(null);
    const response = await POST(request());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      state: 'error',
      error: { code: 'unauthenticated' },
    });
    expect(mocks.capability).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { origin: 'https://attacker.example' },
    { origin: 'http://127.0.0.1:3001' },
    { origin: '' },
    { origin: 'null' },
    { host: 'attacker.example' },
    { origin: 'https://attacker.example', host: 'attacker.example' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
  ] as Record<string, string>[])(
    'rejects cross-origin/malformed write headers %#',
    async (headers) => {
      expect((await POST(request(validBody, headers))).status).toBe(403);
      expect(mocks.preview).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each(
    [null, [], {}, { ...validBody, trackIds }, { ...validBody, accountId: 'another-user' }].map(
      (body) => ({ body }),
    ),
  )('rejects malformed body or client authority %#', async ({ body }) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects malformed JSON and non-JSON content', async () => {
    const malformed = new Request(request(), { body: '{' });
    expect((await POST(malformed)).status).toBe(400);
    expect((await POST(request(validBody, { 'content-type': 'text/plain' }))).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each(['', '   ', '\nname', 'name\u007f', 'name\u009f', 'a'.repeat(101), 12, null])(
    'rejects invalid names %#',
    async (name) => {
      const response = await POST(request({ ...validBody, name }));
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'invalid_name' } });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it.each([
    {},
    null,
    { preset: 'unknown' },
    { preset: '__proto__' },
    { preset: 'constructor' },
    { preset: ['high-energy', 'danceable'] },
    { energyMin: '90', energyMax: '20' },
    { tempoMin: 'NaN' },
    { energyMin: ['20', '30'] },
    { sort: 'random' },
    { limit: '100' },
    { preset: 'high-energy', trackIds },
    { uris: ['spotify:track:arbitrary'] },
    { filters: { energyMin: 0.7 }, sort: 'energy-desc', limit: 30 },
  ])('rejects invalid definitions and arbitrary IDs %#', async (definition) => {
    const response = await POST(request({ ...validBody, definition }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'invalid_definition' } });
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('requires optional export authorization without refreshing or resolving preview', async () => {
    mocks.capability.mockResolvedValue(false);
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      state: 'error',
      error: { code: 'reauthorization_required', retryAfter: null },
    });
    expect(mocks.capability).toHaveBeenCalledWith(session.accountId);
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    'empty_library',
    'no_matches',
    'no_audio_coverage',
    'sync_required',
    'sync_in_progress',
    'invalid_definition',
  ])('rejects unavailable preview %s', async (state) => {
    mocks.preview.mockResolvedValue({ state, tracks: [] });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects an empty successful preview', async () => {
    mocks.preview.mockResolvedValue({ state: 'success', tracks: [] });
    const response = await POST(request());
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'empty_preview' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('regenerates from the authenticated account and sends precisely its ordered tracks', async () => {
    successfulWrites();
    const response = await POST(request());
    expect(response.status).toBe(201);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ state: 'success', playlist, trackCount: 2 });
    expect(mocks.preview).toHaveBeenCalledExactlyOnceWith(session.accountId, validBody.definition);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [createUrl, createOptions] = fetchMock.mock.calls[0]!;
    const [addUrl, addOptions] = fetchMock.mock.calls[1]!;
    expect(String(createUrl)).toBe('https://api.spotify.com/v1/me/playlists');
    expect(createOptions?.method).toBe('POST');
    expect(JSON.parse(String(createOptions?.body))).toEqual({
      name: playlist.name,
      public: false,
      description: 'Created with MuseVault from your saved Spotify library.',
    });
    expect(String(addUrl)).toBe(`https://api.spotify.com/v1/playlists/${playlistId}/items`);
    expect(addOptions?.method).toBe('POST');
    expect(JSON.parse(String(addOptions?.body))).toEqual({
      uris: trackIds.map((id) => `spotify:track:${id}`),
    });
    expect(mocks.enrichment).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls.map(([url]) => String(url)).join(' ')).not.toMatch(
      /reccobeats|\/users\/|\/tracks/,
    );
  });
  it.each([20, 30, 50])('keeps custom parser units/order and a %i preview bound', async (limit) => {
    const definition = {
      energyMin: '70',
      tempoMax: '180',
      sort: 'saved-oldest',
      limit: String(limit),
    };
    const ids = Array.from({ length: limit }, (_, index) => String(index).padStart(22, '0'));
    mocks.preview.mockResolvedValue({
      state: 'success',
      tracks: ids.map((trackId) => ({ trackId })),
    });
    successfulWrites();
    const response = await POST(request({ ...validBody, definition }));
    expect(await response.json()).toMatchObject({ state: 'success', trackCount: limit });
    expect(mocks.preview).toHaveBeenCalledWith(session.accountId, definition);
    expect(JSON.parse(String(fetchMock.mock.calls[1]![1]?.body)).uris).toEqual(
      ids.map((id) => `spotify:track:${id}`),
    );
  });
  it.each([
    { ids: ['bad-id'] },
    { ids: [trackIds[0], trackIds[0]] },
    { ids: Array.from({ length: 31 }, (_, index) => String(index).padStart(22, '0')) },
  ])('validates resolved IDs and definition limit before creating %#', async ({ ids }) => {
    mocks.preview.mockResolvedValue({
      state: 'success',
      tracks: ids.map((trackId) => ({ trackId })),
    });
    expect((await POST(request())).status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('conservative mutating retries and partial results', () => {
  it('refreshes and retries only the explicitly rejected 401 create once', async () => {
    fetchMock.mockResolvedValueOnce(json({ secret: 'raw body' }, 401));
    successfulWrites();
    mocks.refresh
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce({ ...session, accessToken: 'refreshed' });
    expect((await POST(request())).status).toBe(201);
    expect(mocks.refresh).toHaveBeenNthCalledWith(2, session, { force: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]![1]?.body).toBe(fetchMock.mock.calls[1]![1]?.body);
    expect(new Headers(fetchMock.mock.calls[1]![1]?.headers).get('authorization')).toBe(
      'Bearer refreshed',
    );
  });
  it('stops after the second create 401 and never calls add-items', async () => {
    fetchMock.mockResolvedValue(json({}, 401));
    const response = await POST(request());
    expect(response.status).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith('/me/playlists'))).toBe(true);
  });
  it('retries an explicitly rejected add 401 without recreating the playlist', async () => {
    fetchMock
      .mockResolvedValueOnce(json(createBody, 201))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ snapshot_id: 'snapshot' }, 201));
    expect((await POST(request())).status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1]![0]).toBe(fetchMock.mock.calls[2]![0]);
    expect(fetchMock.mock.calls[1]![1]?.body).toBe(fetchMock.mock.calls[2]![1]?.body);
  });
  it('allows at most one forced refresh across the entire export', async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json(createBody, 201))
      .mockResolvedValueOnce(json({}, 401));
    const response = await POST(request());
    expect(await response.json()).toMatchObject({
      state: 'partial_failure',
      playlist,
      error: { code: 'reauthorization_required' },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });
  it('returns a safe partial failure and makes no other write when Spotify reports public visibility', async () => {
    fetchMock.mockResolvedValueOnce(json({ ...createBody, public: true }, 201));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      state: 'partial_failure',
      playlist,
      error: { code: 'wrong_visibility', retryAfter: null },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0]![0])).toBe('https://api.spotify.com/v1/me/playlists');
    expect(JSON.parse(String(fetchMock.mock.calls[0]![1]?.body))).toMatchObject({
      public: false,
    });
  });
  it.each(['12', '-1', 'bad\r\nsecret', '9007199254740992'])(
    'returns safe create rate limits without retry: %s',
    async (retryAfter) => {
      // Headers disallow CRLF; invalid metadata still exercises the existing safe parser.
      const headerValue = retryAfter.replace(/[\r\n]/g, '');
      fetchMock.mockResolvedValueOnce(
        json({ secret: 'raw-body' }, 429, { 'Retry-After': headerValue }),
      );
      const response = await POST(request());
      expect(response.status).toBe(429);
      expect(response.headers.get('retry-after')).toBe(retryAfter === '12' ? '12' : null);
      expect(await response.json()).toMatchObject({
        state: 'error',
        error: { code: 'rate_limited', retryAfter: retryAfter === '12' ? 12 : null },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['network', '500', 'json', 'schema'])(
    'does not replay ambiguous create %s or call add-items',
    async (kind) => {
      if (kind === 'network')
        fetchMock.mockRejectedValueOnce(new Error('private-access-token raw-body'));
      if (kind === '500') fetchMock.mockResolvedValueOnce(json({ secret: 'raw-body' }, 500));
      if (kind === 'json')
        fetchMock.mockResolvedValueOnce(new Response('raw-body', { status: 201 }));
      if (kind === 'schema')
        fetchMock.mockResolvedValueOnce(
          json({ ...createBody, external_urls: { spotify: 'https://attacker.example' } }, 201),
        );
      const response = await POST(request());
      expect(await response.json()).toEqual({
        state: 'error',
        error: { code: 'export_uncertain', retryAfter: null },
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it.each(['network', '500', '429', 'json', 'schema'])(
    'retains a safe created playlist for partial add %s without replay',
    async (kind) => {
      fetchMock.mockResolvedValueOnce(json(createBody, 201));
      if (kind === 'network')
        fetchMock.mockRejectedValueOnce(new Error('private-refresh-token raw-body'));
      if (kind === '500') fetchMock.mockResolvedValueOnce(json({ secret: 'raw-body' }, 500));
      if (kind === '429') fetchMock.mockResolvedValueOnce(json({}, 429, { 'Retry-After': '15' }));
      if (kind === 'json')
        fetchMock.mockResolvedValueOnce(new Response('raw-body', { status: 201 }));
      if (kind === 'schema') fetchMock.mockResolvedValueOnce(json({}, 201));
      const response = await POST(request());
      const body = await response.json();
      expect(body).toMatchObject({ state: 'partial_failure', playlist });
      expect(body).not.toHaveProperty('trackCount');
      expect(JSON.stringify(body)).not.toMatch(
        /private-access|private-refresh|private-account|raw-body|snapshot/,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(response.headers.get('retry-after')).toBe(kind === '429' ? '15' : null);
    },
  );
  it('preserves partial state when refresh after add 401 fails', async () => {
    fetchMock.mockResolvedValueOnce(json(createBody, 201)).mockResolvedValueOnce(json({}, 401));
    mocks.refresh
      .mockResolvedValueOnce(session)
      .mockRejectedValueOnce(
        new SpotifyTokenRefreshError('private-refresh-token', { kind: 'permanent', status: 400 }),
      );
    const response = await POST(request());
    expect(await response.json()).toEqual({
      state: 'partial_failure',
      playlist,
      error: { code: 'reauthorization_required', retryAfter: null },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not attempt a write when initial token refresh is rate limited', async () => {
    mocks.refresh.mockRejectedValueOnce(
      new SpotifyTokenRefreshError('private-token', {
        kind: 'transient',
        status: 429,
        retryAfter: '7',
      }),
    );
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('7');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not treat a non-HTTP 401-shaped failure as replay authorization', async () => {
    fetchMock.mockRejectedValueOnce(new SpotifyApiError('unauthorized', 401, null, 'network'));
    expect((await POST(request())).status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it('has no provider or enrichment imports in the export dependency paths', () => {
    const files = [
      './route.ts',
      '../../../../lib/spotify/playlists.ts',
      '../../../../lib/db/repositories/smart-playlists.ts',
      '../../../../lib/db/repositories/spotify-playlist-export.ts',
    ];
    for (const file of files) {
      const source = fs.readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from ['"][^'"]*(?:audio-features\/|enrichment|reccobeats)/);
    }
  });
});
