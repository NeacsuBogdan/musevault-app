import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ServerEnvironment } from '@/lib/env';
import {
  createOAuthTransaction,
  exchangeSpotifyAuthorizationCode,
  oauthValuesMatch,
  SPOTIFY_AUTHORIZATION_SCOPE,
} from '@/lib/auth/oauth';

const environment: ServerEnvironment = {
  APP_URL: 'http://127.0.0.1:3000',
  SESSION_SECRET: 'test-session-secret-with-at-least-32-characters',
  SPOTIFY_CLIENT_ID: 'test-client-id',
  SPOTIFY_CLIENT_SECRET: 'test-client-secret',
  SPOTIFY_REDIRECT_URI: 'http://127.0.0.1:3000/api/auth/spotify/callback',
};

const codeVerifier = 'v'.repeat(43);

function mockSuccessfulTokenResponse(scope: string | undefined, includeScope = true): void {
  const responseBody: Record<string, unknown> = {
    access_token: 'access-token',
    expires_in: 3_600,
    refresh_token: 'refresh-token',
    token_type: 'Bearer',
  };

  if (includeScope) {
    responseBody.scope = scope;
  }

  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(responseBody), {
      headers: {
        'Content-Type': 'application/json',
      },
      status: 200,
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Spotify OAuth transaction', () => {
  it('creates a valid S256 challenge from a random verifier', () => {
    const transaction = createOAuthTransaction();
    const expectedChallenge = createHash('sha256')
      .update(transaction.codeVerifier, 'ascii')
      .digest('base64url');

    expect(transaction.codeChallenge).toBe(expectedChallenge);
    expect(transaction.codeVerifier).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(transaction.state).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(SPOTIFY_AUTHORIZATION_SCOPE).toBe('user-library-read user-read-private');
  });

  it('accepts only the original well-formed state value', () => {
    const { state } = createOAuthTransaction();

    expect(oauthValuesMatch(state, state)).toBe(true);
    expect(oauthValuesMatch(state, createOAuthTransaction().state)).toBe(false);
    expect(oauthValuesMatch(state, 'not valid state')).toBe(false);
  });
});

describe('Spotify authorization token scopes', () => {
  it('returns the scopes Spotify actually granted and removes duplicates', async () => {
    mockSuccessfulTokenResponse(
      'user-read-private playlist-read-private user-library-read user-read-private',
    );

    await expect(
      exchangeSpotifyAuthorizationCode(environment, 'authorization-code', codeVerifier),
    ).resolves.toEqual({
      accessToken: 'access-token',
      expiresInSeconds: 3_600,
      grantedScopes: ['user-read-private', 'playlist-read-private', 'user-library-read'],
      refreshToken: 'refresh-token',
    });
  });

  it('uses the requested scopes only when Spotify omits the scope field', async () => {
    mockSuccessfulTokenResponse(undefined, false);

    const token = await exchangeSpotifyAuthorizationCode(
      environment,
      'authorization-code',
      codeVerifier,
    );

    expect(token.grantedScopes).toEqual(['user-library-read', 'user-read-private']);
  });

  it('rejects a response missing a required granted scope', async () => {
    mockSuccessfulTokenResponse('user-library-read');

    await expect(
      exchangeSpotifyAuthorizationCode(environment, 'authorization-code', codeVerifier),
    ).rejects.toThrow('Spotify did not grant the required access.');
  });

  it.each(['', '   '])('rejects a supplied blank scope value %#', async (scope) => {
    mockSuccessfulTokenResponse(scope);

    await expect(
      exchangeSpotifyAuthorizationCode(environment, 'authorization-code', codeVerifier),
    ).rejects.toThrow('Spotify returned an invalid token response.');
  });
});
