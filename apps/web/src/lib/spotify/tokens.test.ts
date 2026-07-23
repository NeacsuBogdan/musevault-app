import { describe, expect, it } from 'vitest';

import type { SpotifySession } from '@/lib/auth/session';
import {
  classifySpotifyRefreshFailure,
  mergeSpotifyTokenRefresh,
  shouldRefreshAccessToken,
} from '@/lib/spotify/tokens';

const now = 1_750_000_000_000;

const session: SpotifySession = {
  accessToken: 'old-access-token',
  accountId: 'account-123',
  displayName: 'MuseVault listener',
  expiresAt: now,
  imageUrl: null,
  refreshToken: 'old-refresh-token',
  version: 1,
};

describe('Spotify access-token freshness', () => {
  it('refreshes an expired or nearly expired access token', () => {
    expect(shouldRefreshAccessToken(session, now)).toBe(true);
    expect(
      shouldRefreshAccessToken(
        {
          ...session,
          expiresAt: now + 30_000,
        },
        now,
      ),
    ).toBe(true);
  });

  it('keeps an access token with more than a minute remaining', () => {
    expect(
      shouldRefreshAccessToken(
        {
          ...session,
          expiresAt: now + 61_000,
        },
        now,
      ),
    ).toBe(false);
  });
});

describe('Spotify refresh-token rotation', () => {
  it('preserves the old refresh token when Spotify omits a replacement', () => {
    const refreshedSession = mergeSpotifyTokenRefresh(
      session,
      {
        access_token: 'new-access-token',
        expires_in: 3_600,
        token_type: 'Bearer',
      },
      now,
    );

    expect(refreshedSession.refreshToken).toBe('old-refresh-token');
    expect(refreshedSession.expiresAt).toBe(now + 3_600_000);
  });

  it('uses the replacement refresh token when Spotify rotates it', () => {
    const refreshedSession = mergeSpotifyTokenRefresh(
      session,
      {
        access_token: 'new-access-token',
        expires_in: 3_600,
        refresh_token: 'new-refresh-token',
        token_type: 'Bearer',
      },
      now,
    );

    expect(refreshedSession.refreshToken).toBe('new-refresh-token');
  });
});

describe('Spotify refresh failure classification', () => {
  it('requires reconnection only for an invalid grant', () => {
    const error = classifySpotifyRefreshFailure(
      {
        headers: new Headers(),
        status: 400,
      },
      { error: 'invalid_grant' },
    );

    expect(error).toMatchObject({
      kind: 'permanent',
      requiresReconnect: true,
      status: 400,
    });
  });

  it('does not discard the session for client configuration errors', () => {
    const error = classifySpotifyRefreshFailure(
      {
        headers: new Headers(),
        status: 401,
      },
      { error: 'invalid_client' },
    );

    expect(error).toMatchObject({
      kind: 'transient',
      requiresReconnect: false,
      status: 401,
    });
  });
});
