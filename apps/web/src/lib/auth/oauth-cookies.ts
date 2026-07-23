import 'server-only';

import type { NextResponse } from 'next/server';

import type { OAuthTransaction } from '@/lib/auth/oauth';

export const OAUTH_STATE_COOKIE_NAME = 'musevault_oauth_state';
export const OAUTH_CODE_VERIFIER_COOKIE_NAME = 'musevault_oauth_code_verifier';

const OAUTH_COOKIE_PATH = '/api/auth/spotify/callback';
const OAUTH_COOKIE_MAX_AGE_SECONDS = 10 * 60;

function oauthCookieOptions() {
  return {
    httpOnly: true,
    path: OAUTH_COOKIE_PATH,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

export function setOAuthTransactionCookies(
  response: NextResponse,
  transaction: OAuthTransaction,
): void {
  const expires = new Date(Date.now() + OAUTH_COOKIE_MAX_AGE_SECONDS * 1_000);
  const options = {
    ...oauthCookieOptions(),
    expires,
    maxAge: OAUTH_COOKIE_MAX_AGE_SECONDS,
  };

  response.cookies.set(OAUTH_STATE_COOKIE_NAME, transaction.state, options);
  response.cookies.set(OAUTH_CODE_VERIFIER_COOKIE_NAME, transaction.codeVerifier, options);
}

export function clearOAuthTransactionCookies(response: NextResponse): void {
  const options = {
    ...oauthCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  };

  response.cookies.set(OAUTH_STATE_COOKIE_NAME, '', options);
  response.cookies.set(OAUTH_CODE_VERIFIER_COOKIE_NAME, '', options);
}
