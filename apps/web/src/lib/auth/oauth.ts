import 'server-only';

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import { z } from 'zod';

import type { ServerEnvironment } from '@/lib/env';

const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

const authorizationTokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1),
  scope: z.string().optional(),
  token_type: z.string().toLowerCase().pipe(z.literal('bearer')),
});

const oauthValueSchema = z.string().regex(/^[A-Za-z0-9_-]{32,128}$/);

export const SPOTIFY_AUTHORIZATION_SCOPE = 'user-library-read user-read-private';
const REQUIRED_SPOTIFY_AUTHORIZATION_SCOPES = SPOTIFY_AUTHORIZATION_SCOPE.split(' ');

export interface OAuthTransaction {
  codeChallenge: string;
  codeVerifier: string;
  state: string;
}

export interface SpotifyAuthorizationToken {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
}

export class SpotifyAuthorizationError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = 'SpotifyAuthorizationError';
    this.status = status;
  }
}

function createRandomBase64Url(byteLength: number): string {
  return randomBytes(byteLength).toString('base64url');
}

export function createOAuthTransaction(): OAuthTransaction {
  const codeVerifier = createRandomBase64Url(64);

  return {
    codeChallenge: createHash('sha256').update(codeVerifier, 'ascii').digest('base64url'),
    codeVerifier,
    state: createRandomBase64Url(32),
  };
}

export function isValidOAuthValue(value: string | undefined): value is string {
  return oauthValueSchema.safeParse(value).success;
}

export function oauthValuesMatch(expected: string, received: string): boolean {
  if (!isValidOAuthValue(expected) || !isValidOAuthValue(received)) {
    return false;
  }

  const expectedBytes = Buffer.from(expected, 'ascii');
  const receivedBytes = Buffer.from(received, 'ascii');

  return (
    expectedBytes.byteLength === receivedBytes.byteLength &&
    timingSafeEqual(expectedBytes, receivedBytes)
  );
}

export function buildSpotifyAuthorizationUrl(
  environment: ServerEnvironment,
  transaction: OAuthTransaction,
): URL {
  const authorizationUrl = new URL(SPOTIFY_AUTHORIZE_URL);

  authorizationUrl.search = new URLSearchParams({
    client_id: environment.SPOTIFY_CLIENT_ID,
    code_challenge: transaction.codeChallenge,
    code_challenge_method: 'S256',
    redirect_uri: environment.SPOTIFY_REDIRECT_URI,
    response_type: 'code',
    scope: SPOTIFY_AUTHORIZATION_SCOPE,
    state: transaction.state,
  }).toString();

  return authorizationUrl;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function exchangeSpotifyAuthorizationCode(
  environment: ServerEnvironment,
  code: string,
  codeVerifier: string,
): Promise<SpotifyAuthorizationToken> {
  if (!code.trim() || !isValidOAuthValue(codeVerifier)) {
    throw new SpotifyAuthorizationError('Invalid authorization callback data.');
  }

  let response: Response;

  try {
    response = await fetch(SPOTIFY_TOKEN_URL, {
      body: new URLSearchParams({
        code,
        code_verifier: codeVerifier,
        grant_type: 'authorization_code',
        redirect_uri: environment.SPOTIFY_REDIRECT_URI,
      }),
      cache: 'no-store',
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${environment.SPOTIFY_CLIENT_ID}:${environment.SPOTIFY_CLIENT_SECRET}`,
          'utf8',
        ).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      method: 'POST',
    });
  } catch {
    throw new SpotifyAuthorizationError('Spotify authorization is temporarily unavailable.');
  }

  const responseBody = await readJsonResponse(response);

  if (!response.ok) {
    throw new SpotifyAuthorizationError(
      'Spotify rejected the authorization code.',
      response.status,
    );
  }

  const token = authorizationTokenSchema.safeParse(responseBody);

  if (!token.success) {
    throw new SpotifyAuthorizationError('Spotify returned an invalid token response.');
  }

  const grantedScopes = new Set(token.data.scope?.split(/\s+/).filter(Boolean) ?? []);

  if (
    grantedScopes.size > 0 &&
    REQUIRED_SPOTIFY_AUTHORIZATION_SCOPES.some((scope) => !grantedScopes.has(scope))
  ) {
    throw new SpotifyAuthorizationError('Spotify did not grant the required access.');
  }

  return {
    accessToken: token.data.access_token,
    expiresInSeconds: token.data.expires_in,
    refreshToken: token.data.refresh_token,
  };
}
