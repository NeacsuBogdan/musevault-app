import { NextResponse } from 'next/server';

import { setOAuthTransactionCookies } from '@/lib/auth/oauth-cookies';
import { buildSpotifyAuthorizationUrl, createOAuthTransaction } from '@/lib/auth/oauth';
import { getServerEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export function GET(): NextResponse {
  try {
    const environment = getServerEnv();
    const transaction = createOAuthTransaction();
    const response = NextResponse.redirect(buildSpotifyAuthorizationUrl(environment, transaction));

    response.headers.set('Cache-Control', 'no-store');
    setOAuthTransactionCookies(response, transaction);

    return response;
  } catch {
    return NextResponse.json(
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
  }
}
