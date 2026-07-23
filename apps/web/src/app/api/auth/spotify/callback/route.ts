import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import {
  clearOAuthTransactionCookies,
  OAUTH_CODE_VERIFIER_COOKIE_NAME,
  OAUTH_STATE_COOKIE_NAME,
} from '@/lib/auth/oauth-cookies';
import {
  exchangeSpotifyAuthorizationCode,
  isValidOAuthValue,
  oauthValuesMatch,
  type SpotifyAuthorizationToken,
} from '@/lib/auth/oauth';
import { writeSession } from '@/lib/auth/session';
import { getServerEnv, type ServerEnvironment } from '@/lib/env';
import { getSpotifyProfile } from '@/lib/spotify/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type CallbackErrorCode =
  | 'access_denied'
  | 'authorization_failed'
  | 'invalid_callback'
  | 'profile_failed'
  | 'session_failed'
  | 'state_mismatch'
  | 'token_exchange_failed';

function getSingleQueryParameter(request: NextRequest, name: string): string | undefined {
  const values = request.nextUrl.searchParams.getAll(name);

  return values.length === 1 && values[0] ? values[0] : undefined;
}

function callbackRedirect(
  environment: ServerEnvironment,
  pathname: '/' | '/library',
  error?: CallbackErrorCode,
): NextResponse {
  const redirectUrl = new URL(pathname, environment.APP_URL);

  if (error) {
    redirectUrl.searchParams.set('spotifyError', error);
  }

  const response = NextResponse.redirect(redirectUrl);
  response.headers.set('Cache-Control', 'no-store');
  clearOAuthTransactionCookies(response);

  return response;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let environment: ServerEnvironment;

  try {
    environment = getServerEnv();
  } catch {
    const response = NextResponse.json(
      {
        error: 'Spotify authentication is not configured.',
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
        status: 503,
      },
    );
    clearOAuthTransactionCookies(response);

    return response;
  }

  const returnedState = getSingleQueryParameter(request, 'state');
  const storedState = request.cookies.get(OAUTH_STATE_COOKIE_NAME)?.value;

  if (!storedState || !returnedState || !oauthValuesMatch(storedState, returnedState)) {
    return callbackRedirect(environment, '/', 'state_mismatch');
  }

  const authorizationError = getSingleQueryParameter(request, 'error');

  if (authorizationError) {
    return callbackRedirect(
      environment,
      '/',
      authorizationError === 'access_denied' ? 'access_denied' : 'authorization_failed',
    );
  }

  const code = getSingleQueryParameter(request, 'code');
  const codeVerifier = request.cookies.get(OAUTH_CODE_VERIFIER_COOKIE_NAME)?.value;

  if (!code || !isValidOAuthValue(codeVerifier)) {
    return callbackRedirect(environment, '/', 'invalid_callback');
  }

  let token: SpotifyAuthorizationToken;

  try {
    token = await exchangeSpotifyAuthorizationCode(environment, code, codeVerifier);
  } catch {
    return callbackRedirect(environment, '/', 'token_exchange_failed');
  }

  let profile: Awaited<ReturnType<typeof getSpotifyProfile>>;

  try {
    profile = await getSpotifyProfile(token.accessToken);
  } catch {
    return callbackRedirect(environment, '/', 'profile_failed');
  }

  try {
    await writeSession({
      accessToken: token.accessToken,
      accountId: profile.accountId,
      displayName: profile.displayName,
      expiresAt: Date.now() + token.expiresInSeconds * 1_000,
      imageUrl: profile.imageUrl,
      refreshToken: token.refreshToken,
      version: 1,
    });

    return callbackRedirect(environment, '/library');
  } catch {
    return callbackRedirect(environment, '/', 'session_failed');
  }
}
