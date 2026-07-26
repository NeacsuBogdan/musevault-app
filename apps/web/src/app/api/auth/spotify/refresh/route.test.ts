import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpotifySession } from '@/lib/auth/session';
import { SpotifyApiError } from '@/lib/spotify/errors';
import { SpotifyTokenRefreshError } from '@/lib/spotify/tokens';

import { GET } from './route';

const refreshMocks = vi.hoisted(() => ({
  deleteSession: vi.fn<() => Promise<void>>(),
  ensureFreshSpotifySession: vi.fn<
    (
      session: SpotifySession,
      options?: {
        force?: boolean;
      },
    ) => Promise<SpotifySession>
  >(),
  loadSpotifySavedTracksPage: vi.fn(),
  readSession: vi.fn<() => Promise<SpotifySession | null>>(),
}));

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();

  return {
    ...actual,
    deleteSession: refreshMocks.deleteSession,
    readSession: refreshMocks.readSession,
  };
});

vi.mock('@/lib/spotify/saved-tracks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/spotify/saved-tracks')>();

  return {
    ...actual,
    loadSpotifySavedTracksPage: refreshMocks.loadSpotifySavedTracksPage,
  };
});

vi.mock('@/lib/spotify/tokens', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/spotify/tokens')>();

  return {
    ...actual,
    ensureFreshSpotifySession: refreshMocks.ensureFreshSpotifySession,
  };
});

const session: SpotifySession = {
  accessToken: 'access-token',
  accountId: 'account-123',
  displayName: 'MuseVault listener',
  expiresAt: 1_800_000_000_000,
  imageUrl: null,
  refreshToken: 'refresh-token',
  version: 1,
};

function createRequest(
  path = '/api/auth/spotify/refresh',
  fetchSite: 'cross-site' | 'none' | 'same-origin' | 'same-site' | null = 'same-origin',
): NextRequest {
  const headers = new Headers();

  if (fetchSite !== null) {
    headers.set('sec-fetch-site', fetchSite);
  }

  return new NextRequest(`http://127.0.0.1:3000${path}`, {
    headers,
  });
}

beforeEach(() => {
  refreshMocks.deleteSession.mockResolvedValue();
  refreshMocks.ensureFreshSpotifySession.mockResolvedValue(session);
  refreshMocks.loadSpotifySavedTracksPage.mockResolvedValue({
    items: [],
    limit: 1,
    offset: 0,
    total: 0,
  });
  refreshMocks.readSession.mockResolvedValue(session);
});

describe('dashboard Spotify refresh route', () => {
  it('rejects an explicit cross-site request before reading the session', async () => {
    const response = await GET(createRequest(undefined, 'cross-site'));

    expect(response.status).toBe(403);
    expect(refreshMocks.readSession).not.toHaveBeenCalled();
    expect(refreshMocks.ensureFreshSpotifySession).not.toHaveBeenCalled();
  });

  it.each([
    {
      fetchSite: 'same-site',
      source: 'a sibling origin',
    },
    {
      fetchSite: null,
      source: 'a request without Fetch Metadata',
    },
  ] as const)('rejects $fetchSite requests from $source', async ({ fetchSite }) => {
    const response = await GET(createRequest(undefined, fetchSite));

    expect(response.status).toBe(403);
    expect(refreshMocks.readSession).not.toHaveBeenCalled();
    expect(refreshMocks.ensureFreshSpotifySession).not.toHaveBeenCalled();
  });

  it('allows a user-initiated top-level navigation', async () => {
    const response = await GET(createRequest(undefined, 'none'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/dashboard');
    expect(refreshMocks.ensureFreshSpotifySession).toHaveBeenCalledWith(session, { force: false });
  });

  it('redirects a request without a session to the homepage', async () => {
    refreshMocks.readSession.mockResolvedValue(null);

    const response = await GET(createRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/');
    expect(refreshMocks.ensureFreshSpotifySession).not.toHaveBeenCalled();
  });

  it('persists a forced refresh, verifies it once, and returns to the dashboard', async () => {
    const response = await GET(createRequest('/api/auth/spotify/refresh?force=1'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/dashboard?spotifyRefresh=forced');
    expect(refreshMocks.ensureFreshSpotifySession).toHaveBeenCalledWith(session, { force: true });
    expect(refreshMocks.loadSpotifySavedTracksPage).toHaveBeenCalledWith(
      session,
      { limit: 1, offset: 0 },
      {
        forcedRefreshCompleted: true,
        refreshMode: 'signal',
      },
    );
  });

  it('clears a permanently invalid session and redirects to reconnect', async () => {
    refreshMocks.ensureFreshSpotifySession.mockRejectedValue(
      new SpotifyTokenRefreshError('Authorization expired.', {
        kind: 'permanent',
        status: 400,
      }),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/?spotifyError=authorization_expired');
    expect(refreshMocks.deleteSession).toHaveBeenCalledOnce();
  });

  it('preserves a safe Spotify rate-limit delay', async () => {
    refreshMocks.ensureFreshSpotifySession.mockRejectedValue(
      new SpotifyTokenRefreshError('Rate limited.', {
        kind: 'transient',
        retryAfter: '19',
        status: 429,
      }),
    );

    const response = await GET(createRequest());

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(
      '/dashboard?spotifyError=rate_limited&retryAfter=19',
    );
    expect(refreshMocks.deleteSession).not.toHaveBeenCalled();
  });

  it('clears the session when Spotify still returns 401 after the forced refresh', async () => {
    refreshMocks.loadSpotifySavedTracksPage.mockRejectedValue(
      new SpotifyApiError('unauthorized', 401),
    );

    const response = await GET(createRequest('/api/auth/spotify/refresh?force=1'));

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/?spotifyError=authorization_expired');
    expect(refreshMocks.deleteSession).toHaveBeenCalledOnce();
  });
});
