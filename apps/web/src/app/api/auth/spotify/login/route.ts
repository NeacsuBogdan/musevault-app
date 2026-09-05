import { type NextRequest, NextResponse } from 'next/server';

import { setOAuthTransactionCookies } from '@/lib/auth/oauth-cookies';
import { buildSpotifyAuthorizationUrl, createOAuthTransaction } from '@/lib/auth/oauth';
import { getSafeOAuthReturnPath } from '@/lib/auth/oauth-return-path';
import { readSession } from '@/lib/auth/session';
import { getServerEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const environment = getServerEnv();
    const capabilities = request.nextUrl.searchParams.getAll('capability');
    if (
      capabilities.length > 1 ||
      (capabilities.length === 1 && capabilities[0] !== 'playlist-export')
    ) {
      return NextResponse.json(
        { error: 'Invalid Spotify authorization capability.' },
        { headers: { 'Cache-Control': 'no-store' }, status: 400 },
      );
    }

    const capability = capabilities[0] === 'playlist-export' ? 'playlist-export' : undefined;
    const session = capability ? await readSession() : null;
    if (capability && !session) {
      return NextResponse.json(
        { error: 'Sign in to MuseVault before enabling playlist export.' },
        { headers: { 'Cache-Control': 'no-store' }, status: 401 },
      );
    }

    const returnPaths = request.nextUrl.searchParams.getAll('returnTo');
    const returnTo =
      (returnPaths.length === 1 && getSafeOAuthReturnPath(returnPaths[0])) || '/smart-playlists';
    const transaction = createOAuthTransaction(capability);
    const response = NextResponse.redirect(
      buildSpotifyAuthorizationUrl(environment, transaction, capability),
    );

    response.headers.set('Cache-Control', 'no-store');
    setOAuthTransactionCookies(
      response,
      transaction,
      session
        ? { accountId: session.accountId, returnTo, secret: environment.SESSION_SECRET }
        : undefined,
    );

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
