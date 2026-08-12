import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureFreshSpotifySession: vi.fn(),
  getSpotifyRecentlyPlayed: vi.fn(),
  getSpotifyTopArtists: vi.fn(),
  getSpotifyTopTracks: vi.fn(),
}));

vi.mock('./client', () => ({
  getSpotifyRecentlyPlayed: mocks.getSpotifyRecentlyPlayed,
  getSpotifyTopArtists: mocks.getSpotifyTopArtists,
  getSpotifyTopTracks: mocks.getSpotifyTopTracks,
}));
vi.mock('./tokens', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./tokens')>()),
  ensureFreshSpotifySession: mocks.ensureFreshSpotifySession,
}));

import type { SpotifySession } from '@/lib/auth/session';
import { sanitizeSpotifySchemaIssues, SpotifyApiError } from './errors';
import { loadRecentlyPlayed, loadTopArtists, loadTopTracks } from './listening-client';
import { SpotifyTokenRefreshError } from './tokens';

const session: SpotifySession = {
  accessToken: 'private-access-token',
  accountId: 'private-account-id',
  displayName: 'Private listener',
  expiresAt: 2_000_000_000_000,
  imageUrl: null,
  refreshToken: 'private-refresh-token',
  version: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureFreshSpotifySession.mockResolvedValue(session);
});

function diagnostic() {
  return vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

describe('safe listening failure diagnostics', () => {
  it('identifies a Recently Played schema failure without sensitive values', async () => {
    const output = diagnostic();
    mocks.getSpotifyRecentlyPlayed.mockRejectedValue(
      new SpotifyApiError('invalid_response', 200, null, 'schema'),
    );

    await expect(loadRecentlyPlayed(session, { limit: 50, before: 1_234_567 })).rejects.toThrow();

    expect(output).toHaveBeenCalledOnce();
    expect(output).toHaveBeenCalledWith(
      'spotify_listening_failure operation=recently_played category=schema kind=invalid_response status=200',
    );
    const serialized = JSON.stringify(output.mock.calls);
    for (const forbidden of [
      'private-access-token',
      'private-refresh-token',
      'private-account-id',
      'Authorization',
      'cookie',
      '1_234_567',
      '1234567',
      'spotify-response-body',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('logs only deduplicated, capped, normalized Recently Played Zod issue metadata', async () => {
    const output = diagnostic();
    const receivedValue = 'private-spotify-track-id';
    const issues = [
      { path: ['items', 3, 'track', 'id'], code: 'invalid_type', receivedValue },
      { path: ['items', 7, 'track', 'id'], code: 'invalid_type', receivedValue },
      ...Array.from({ length: 12 }, (_, index) => ({
        path: ['items', index, 'track', `field_${index}`],
        code: 'invalid_type',
        receivedValue,
      })),
    ];
    const safeIssues = sanitizeSpotifySchemaIssues(issues);
    mocks.getSpotifyRecentlyPlayed.mockRejectedValue(
      new SpotifyApiError('invalid_response', 200, null, 'schema', safeIssues),
    );

    await expect(loadRecentlyPlayed(session, { limit: 50 })).rejects.toThrow();

    const schemaLines = output.mock.calls
      .map(([line]) => String(line))
      .filter((line) => line.startsWith('spotify_listening_schema_issue'));
    expect(schemaLines).toHaveLength(10);
    expect(schemaLines[0]).toBe(
      'spotify_listening_schema_issue operation=recently_played path=items.*.track.id code=invalid_type',
    );
    expect(
      schemaLines.filter((line) => line.includes('path=items.*.track.id code=invalid_type')),
    ).toHaveLength(1);
    expect(JSON.stringify(output.mock.calls)).not.toContain(receivedValue);
  });

  it('identifies a Recently Played HTTP 5xx failure', async () => {
    const output = diagnostic();
    mocks.getSpotifyRecentlyPlayed.mockRejectedValue(
      new SpotifyApiError('unavailable', 503, null, 'http'),
    );

    await expect(loadRecentlyPlayed(session, { limit: 50 })).rejects.toThrow();
    expect(output).toHaveBeenCalledWith(
      'spotify_listening_failure operation=recently_played category=http kind=unavailable status=503',
    );
  });

  it('identifies Top Items operations and time ranges', async () => {
    const output = diagnostic();
    mocks.getSpotifyTopTracks.mockRejectedValue(
      new SpotifyApiError('invalid_response', 200, null, 'json'),
    );
    mocks.getSpotifyTopArtists.mockRejectedValue(
      new SpotifyApiError('rate_limited', 429, 3, 'http'),
    );

    await expect(loadTopTracks(session, 'medium_term')).rejects.toThrow();
    await expect(loadTopArtists(session, 'long_term')).rejects.toThrow();
    expect(output.mock.calls).toEqual([
      [
        'spotify_listening_failure operation=top_tracks_medium_term category=json kind=invalid_response status=200',
      ],
      [
        'spotify_listening_failure operation=top_artists_long_term category=http kind=rate_limited status=429',
      ],
    ]);
  });

  it('identifies token refresh separately without serializing its error', async () => {
    const output = diagnostic();
    mocks.ensureFreshSpotifySession.mockRejectedValue(
      new SpotifyTokenRefreshError('spotify-response-body private-refresh-token', {
        kind: 'transient',
        status: 403,
      }),
    );

    await expect(loadRecentlyPlayed(session, { limit: 50 })).rejects.toThrow();
    expect(output).toHaveBeenCalledOnce();
    expect(output).toHaveBeenCalledWith(
      'spotify_listening_failure operation=token_refresh category=refresh kind=unavailable status=403',
    );
    expect(JSON.stringify(output.mock.calls)).not.toMatch(
      /spotify-response-body|private-refresh-token/,
    );
  });
});
