import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OAUTH_CODE_VERIFIER_COOKIE_NAME, OAUTH_STATE_COOKIE_NAME } from '@/lib/auth/oauth-cookies';
import type { SpotifyAuthorizationToken } from '@/lib/auth/oauth';
import type { ServerEnvironment } from '@/lib/env';
import type { SpotifyProfile } from '@/types/spotify';

const callbackMocks = vi.hoisted(() => ({
  callOrder: [] as string[],
  exchangeSpotifyAuthorizationCode: vi.fn(),
  getServerEnv: vi.fn(),
  getSpotifyProfile: vi.fn(),
  upsertSpotifyUserAndConnection: vi.fn(),
  writeSession: vi.fn(),
}));

vi.mock('@/lib/auth/oauth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/oauth')>();

  return {
    ...actual,
    exchangeSpotifyAuthorizationCode: callbackMocks.exchangeSpotifyAuthorizationCode,
  };
});

vi.mock('@/lib/auth/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/session')>();

  return {
    ...actual,
    writeSession: callbackMocks.writeSession,
  };
});

vi.mock('@/lib/db/repositories/spotify-connections', () => ({
  upsertSpotifyUserAndConnection: callbackMocks.upsertSpotifyUserAndConnection,
}));

vi.mock('@/lib/env', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/env')>();

  return {
    ...actual,
    getServerEnv: callbackMocks.getServerEnv,
  };
});

vi.mock('@/lib/spotify/client', () => ({
  getSpotifyProfile: callbackMocks.getSpotifyProfile,
}));

import { GET } from './route';

const environment: ServerEnvironment = {
  APP_URL: 'http://127.0.0.1:3000',
  SESSION_SECRET: 'test-session-secret-with-at-least-32-characters',
  SPOTIFY_CLIENT_ID: 'test-client-id',
  SPOTIFY_CLIENT_SECRET: 'test-client-secret',
  SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:3000/api/auth/spotify/callback',
};

const profile: SpotifyProfile = {
  accountId: 'stable-account-id',
  displayName: 'MuseVault listener',
  imageUrl: 'https://i.scdn.co/image/profile-image',
};

const token: SpotifyAuthorizationToken = {
  accessToken: 'access-token',
  expiresInSeconds: 3_600,
  grantedScopes: ['user-library-read', 'user-read-private'],
  refreshToken: 'refresh-token',
};

const state = 's'.repeat(43);
const codeVerifier = 'v'.repeat(43);

function createCallbackRequest(returnedState = state): NextRequest {
  const url = new URL('/api/auth/spotify/callback', environment.APP_URL);
  url.searchParams.set('code', 'authorization-code');
  url.searchParams.set('state', returnedState);

  return new NextRequest(url, {
    headers: {
      cookie: `${OAUTH_STATE_COOKIE_NAME}=${state}; ${OAUTH_CODE_VERIFIER_COOKIE_NAME}=${codeVerifier}`,
    },
  });
}

function expectOAuthTransactionCookiesCleared(response: Response): void {
  const setCookie = response.headers.get('set-cookie');

  expect(setCookie).toContain(`${OAUTH_STATE_COOKIE_NAME}=`);
  expect(setCookie).toContain(`${OAUTH_CODE_VERIFIER_COOKIE_NAME}=`);
  expect(setCookie).toContain('Max-Age=0');
}

beforeEach(() => {
  callbackMocks.callOrder.length = 0;
  callbackMocks.exchangeSpotifyAuthorizationCode.mockResolvedValue(token);
  callbackMocks.getServerEnv.mockReturnValue(environment);
  callbackMocks.getSpotifyProfile.mockResolvedValue(profile);
  callbackMocks.upsertSpotifyUserAndConnection.mockImplementation(async () => {
    callbackMocks.callOrder.push('persistence');

    return {
      displayName: profile.displayName,
      imageUrl: profile.imageUrl,
      spotifyAccountId: profile.accountId,
      userId: '00000000-0000-4000-8000-000000000001',
    };
  });
  callbackMocks.writeSession.mockImplementation(async () => {
    callbackMocks.callOrder.push('session');
  });
});

describe('Spotify OAuth callback persistence', () => {
  it('persists the safe Spotify connection before writing the session', async () => {
    const response = await GET(createCallbackRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://127.0.0.1:3000/library');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(callbackMocks.callOrder).toEqual(['persistence', 'session']);
    expect(callbackMocks.upsertSpotifyUserAndConnection).toHaveBeenCalledWith({
      displayName: profile.displayName,
      grantedScopes: token.grantedScopes,
      imageUrl: profile.imageUrl,
      refreshToken: token.refreshToken,
      spotifyAccountId: profile.accountId,
    });

    const persistenceInput = callbackMocks.upsertSpotifyUserAndConnection.mock.calls[0]?.[0];

    expect(persistenceInput).not.toHaveProperty('accessToken');
    expect(callbackMocks.writeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: token.accessToken,
        accountId: profile.accountId,
        displayName: profile.displayName,
        imageUrl: profile.imageUrl,
        refreshToken: token.refreshToken,
        version: 1,
      }),
    );
    expectOAuthTransactionCookiesCleared(response);
  });

  it('uses a fixed safe error and does not write a session when persistence fails', async () => {
    const sensitiveDatabaseError = 'SENSITIVE_DATABASE_ERROR_SENTINEL';
    callbackMocks.upsertSpotifyUserAndConnection.mockImplementation(async () => {
      callbackMocks.callOrder.push('persistence');
      throw new Error(sensitiveDatabaseError);
    });

    const response = await GET(createCallbackRequest());
    const publicResponse = [
      String(response.status),
      response.headers.get('location') ?? '',
      response.headers.get('cache-control') ?? '',
      await response.text(),
    ].join(' ');

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://127.0.0.1:3000/?spotifyError=persistence_failed',
    );
    expect(callbackMocks.callOrder).toEqual(['persistence']);
    expect(callbackMocks.writeSession).not.toHaveBeenCalled();
    expect(publicResponse).not.toContain(sensitiveDatabaseError);
    expectOAuthTransactionCookiesCleared(response);
  });

  it('preserves session_failed after persistence succeeds but session writing fails', async () => {
    callbackMocks.writeSession.mockImplementation(async () => {
      callbackMocks.callOrder.push('session');
      throw new Error('Session cookie write failed.');
    });

    const response = await GET(createCallbackRequest());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://127.0.0.1:3000/?spotifyError=session_failed',
    );
    expect(callbackMocks.callOrder).toEqual(['persistence', 'session']);
    expect(callbackMocks.upsertSpotifyUserAndConnection).toHaveBeenCalledOnce();
    expectOAuthTransactionCookiesCleared(response);
  });

  it('rejects a state mismatch before token exchange, persistence, or session writing', async () => {
    const response = await GET(createCallbackRequest('x'.repeat(43)));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://127.0.0.1:3000/?spotifyError=state_mismatch',
    );
    expect(callbackMocks.exchangeSpotifyAuthorizationCode).not.toHaveBeenCalled();
    expect(callbackMocks.upsertSpotifyUserAndConnection).not.toHaveBeenCalled();
    expect(callbackMocks.writeSession).not.toHaveBeenCalled();
    expectOAuthTransactionCookiesCleared(response);
  });
});
