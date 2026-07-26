import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpotifySession } from '@/lib/auth/session';
import { SpotifyApiError } from '@/lib/spotify/errors';
import { SpotifyTokenRefreshError } from '@/lib/spotify/tokens';
import type { SavedTracksPage } from '@/types/spotify';

import { dashboardErrorStateFrom, loadDashboardData } from './dashboard-data';

const dashboardDataMocks = vi.hoisted(() => ({
  loadSpotifySavedTracksPage: vi.fn(),
}));

vi.mock('@/lib/spotify/saved-tracks', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/spotify/saved-tracks')>();

  return {
    ...actual,
    loadSpotifySavedTracksPage: dashboardDataMocks.loadSpotifySavedTracksPage,
  };
});

const session: SpotifySession = {
  accessToken: 'test-access-token',
  accountId: 'account-123',
  displayName: 'MuseVault listener',
  expiresAt: 1_800_000_000_000,
  imageUrl: null,
  refreshToken: 'test-refresh-token',
  version: 1,
};

const page: SavedTracksPage = {
  items: [],
  limit: 50,
  offset: 0,
  total: 73,
};

beforeEach(() => {
  dashboardDataMocks.loadSpotifySavedTracksPage.mockReset();
});

describe('dashboard data loading', () => {
  it('loads the maximum saved-tracks page through the shared server service', async () => {
    dashboardDataMocks.loadSpotifySavedTracksPage.mockResolvedValue(page);

    const state = await loadDashboardData(session);

    expect(dashboardDataMocks.loadSpotifySavedTracksPage).toHaveBeenCalledWith(
      session,
      { limit: 50, offset: 0 },
      {
        forcedRefreshCompleted: undefined,
        refreshMode: 'signal',
      },
    );
    expect(state.status).toBe('success');

    if (state.status === 'success') {
      expect(state.viewModel.loadedTrackCount).toBe(0);
      expect(state.viewModel.statistics[0]?.value).toBe('73');
    }
  });
});

describe('dashboard data error mapping', () => {
  it('requires reconnection for permanent authorization failures', () => {
    expect(
      dashboardErrorStateFrom(
        new SpotifyTokenRefreshError('Authorization expired.', {
          kind: 'permanent',
          status: 400,
        }),
      ),
    ).toEqual({ status: 'authorization_expired' });
    expect(dashboardErrorStateFrom(new SpotifyApiError('unauthorized', 401))).toEqual({
      status: 'authorization_expired',
    });
    expect(dashboardErrorStateFrom(new SpotifyApiError('forbidden', 403))).toEqual({
      status: 'authorization_expired',
    });
  });

  it('keeps a safe retry delay for Spotify rate limiting', () => {
    expect(dashboardErrorStateFrom(new SpotifyApiError('rate_limited', 429, 17))).toEqual({
      status: 'rate_limited',
      retryAfter: 17,
    });
  });

  it('maps temporary Spotify and refresh failures without internal details', () => {
    expect(dashboardErrorStateFrom(new SpotifyApiError('unavailable', 503))).toEqual({
      status: 'temporarily_unavailable',
    });
    expect(
      dashboardErrorStateFrom(
        new SpotifyTokenRefreshError('Internal upstream detail.', {
          kind: 'transient',
          status: 502,
        }),
      ),
    ).toEqual({ status: 'temporarily_unavailable' });
  });

  it('uses a generic state for unknown failures', () => {
    expect(dashboardErrorStateFrom(new Error('Sensitive internal detail'))).toEqual({
      status: 'unexpected_failure',
    });
  });
});
