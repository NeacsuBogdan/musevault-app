import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ZodError } from 'zod';

import type { SpotifySession } from '@/lib/auth/session';
import type { SavedTracksPage } from '@/types/spotify';

import { SpotifyApiError } from './errors';
import { loadSpotifySavedTracksPage, SavedTracksSessionRefreshRequired } from './saved-tracks';

const spotifyMocks = vi.hoisted(() => ({
  ensureFreshSpotifySession: vi.fn<
    (
      session: SpotifySession,
      options?: {
        force?: boolean;
      },
    ) => Promise<SpotifySession>
  >(),
  getSpotifySavedTracks: vi.fn<
    (
      accessToken: string,
      pagination: {
        limit: number;
        offset: number;
      },
    ) => Promise<SavedTracksPage>
  >(),
  shouldRefreshAccessToken: vi.fn<(session: SpotifySession) => boolean>(),
}));

vi.mock('./client', () => ({
  getSpotifySavedTracks: spotifyMocks.getSpotifySavedTracks,
}));

vi.mock('./tokens', () => ({
  ensureFreshSpotifySession: spotifyMocks.ensureFreshSpotifySession,
  shouldRefreshAccessToken: spotifyMocks.shouldRefreshAccessToken,
}));

const session: SpotifySession = {
  accessToken: 'initial-access-token',
  accountId: 'account-123',
  displayName: 'MuseVault listener',
  expiresAt: 1_800_000_000_000,
  imageUrl: null,
  refreshToken: 'initial-refresh-token',
  version: 1,
};

const proactivelyRefreshedSession: SpotifySession = {
  ...session,
  accessToken: 'proactively-refreshed-access-token',
  expiresAt: session.expiresAt + 3_600_000,
};

const forciblyRefreshedSession: SpotifySession = {
  ...proactivelyRefreshedSession,
  accessToken: 'forcibly-refreshed-access-token',
};

const page: SavedTracksPage = {
  items: [],
  limit: 50,
  offset: 0,
  total: 0,
};

const pagination = {
  limit: 50,
  offset: 0,
} as const;

beforeEach(() => {
  spotifyMocks.ensureFreshSpotifySession.mockResolvedValue(session);
  spotifyMocks.getSpotifySavedTracks.mockResolvedValue(page);
  spotifyMocks.shouldRefreshAccessToken.mockReturnValue(false);
});

describe('saved-tracks application service', () => {
  it('uses the session returned by proactive refresh in the default mode', async () => {
    spotifyMocks.ensureFreshSpotifySession.mockResolvedValue(proactivelyRefreshedSession);

    await expect(loadSpotifySavedTracksPage(session, pagination)).resolves.toBe(page);
    expect(spotifyMocks.ensureFreshSpotifySession).toHaveBeenCalledWith(session);
    expect(spotifyMocks.getSpotifySavedTracks).toHaveBeenCalledWith(
      proactivelyRefreshedSession.accessToken,
      pagination,
    );
  });

  it('forces one refresh and retries once after the first Spotify 401', async () => {
    const unauthorized = new SpotifyApiError('unauthorized', 401);

    spotifyMocks.ensureFreshSpotifySession
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(forciblyRefreshedSession);
    spotifyMocks.getSpotifySavedTracks
      .mockRejectedValueOnce(unauthorized)
      .mockResolvedValueOnce(page);

    await expect(loadSpotifySavedTracksPage(session, pagination)).resolves.toBe(page);
    expect(spotifyMocks.ensureFreshSpotifySession).toHaveBeenNthCalledWith(1, session);
    expect(spotifyMocks.ensureFreshSpotifySession).toHaveBeenNthCalledWith(2, session, {
      force: true,
    });
    expect(spotifyMocks.getSpotifySavedTracks).toHaveBeenNthCalledWith(
      1,
      session.accessToken,
      pagination,
    );
    expect(spotifyMocks.getSpotifySavedTracks).toHaveBeenNthCalledWith(
      2,
      forciblyRefreshedSession.accessToken,
      pagination,
    );
  });

  it('propagates a second Spotify 401 without a third refresh or request', async () => {
    const firstUnauthorized = new SpotifyApiError('unauthorized', 401);
    const secondUnauthorized = new SpotifyApiError('unauthorized', 401);

    spotifyMocks.ensureFreshSpotifySession
      .mockResolvedValueOnce(session)
      .mockResolvedValueOnce(forciblyRefreshedSession);
    spotifyMocks.getSpotifySavedTracks
      .mockRejectedValueOnce(firstUnauthorized)
      .mockRejectedValueOnce(secondUnauthorized);

    await expect(loadSpotifySavedTracksPage(session, pagination)).rejects.toBe(secondUnauthorized);
    expect(spotifyMocks.ensureFreshSpotifySession).toHaveBeenCalledTimes(2);
    expect(spotifyMocks.getSpotifySavedTracks).toHaveBeenCalledTimes(2);
  });

  it('propagates non-authorization Spotify errors without forcing a refresh', async () => {
    const rateLimited = new SpotifyApiError('rate_limited', 429, 12);

    spotifyMocks.getSpotifySavedTracks.mockRejectedValueOnce(rateLimited);

    await expect(loadSpotifySavedTracksPage(session, pagination)).rejects.toBe(rateLimited);
    expect(spotifyMocks.ensureFreshSpotifySession).toHaveBeenCalledOnce();
    expect(spotifyMocks.getSpotifySavedTracks).toHaveBeenCalledOnce();
  });

  it.each([
    { limit: 0, offset: 0 },
    { limit: 51, offset: 0 },
    { limit: 1, offset: -1 },
    { limit: 1, offset: 0.5 },
    { limit: 1, offset: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects invalid pagination before refresh or fetch: %o', async (invalidPagination) => {
    await expect(loadSpotifySavedTracksPage(session, invalidPagination)).rejects.toBeInstanceOf(
      ZodError,
    );
    expect(spotifyMocks.ensureFreshSpotifySession).not.toHaveBeenCalled();
    expect(spotifyMocks.getSpotifySavedTracks).not.toHaveBeenCalled();
  });
});

describe('Server Component refresh signaling', () => {
  it('signals a proactive refresh before any refresh or Spotify request', async () => {
    spotifyMocks.shouldRefreshAccessToken.mockReturnValue(true);

    const result = loadSpotifySavedTracksPage(session, pagination, {
      refreshMode: 'signal',
    });

    await expect(result).rejects.toMatchObject({
      force: false,
      name: 'SavedTracksSessionRefreshRequired',
    });
    await expect(result).rejects.toBeInstanceOf(SavedTracksSessionRefreshRequired);
    expect(spotifyMocks.ensureFreshSpotifySession).not.toHaveBeenCalled();
    expect(spotifyMocks.getSpotifySavedTracks).not.toHaveBeenCalled();
  });

  it('signals a forced refresh before persistence after the first Spotify 401', async () => {
    spotifyMocks.getSpotifySavedTracks.mockRejectedValueOnce(
      new SpotifyApiError('unauthorized', 401),
    );

    await expect(
      loadSpotifySavedTracksPage(session, pagination, {
        refreshMode: 'signal',
      }),
    ).rejects.toMatchObject({
      force: true,
      name: 'SavedTracksSessionRefreshRequired',
    });
    expect(spotifyMocks.ensureFreshSpotifySession).not.toHaveBeenCalled();
    expect(spotifyMocks.getSpotifySavedTracks).toHaveBeenCalledOnce();
  });

  it('propagates a repeated 401 after a completed forced-refresh bounce', async () => {
    const unauthorized = new SpotifyApiError('unauthorized', 401);

    spotifyMocks.getSpotifySavedTracks.mockRejectedValueOnce(unauthorized);

    await expect(
      loadSpotifySavedTracksPage(session, pagination, {
        forcedRefreshCompleted: true,
        refreshMode: 'signal',
      }),
    ).rejects.toBe(unauthorized);
    expect(spotifyMocks.ensureFreshSpotifySession).not.toHaveBeenCalled();
    expect(spotifyMocks.getSpotifySavedTracks).toHaveBeenCalledOnce();
  });
});
