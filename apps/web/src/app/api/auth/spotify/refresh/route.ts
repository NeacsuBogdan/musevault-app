import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { deleteSession, readSession } from '@/lib/auth/session';
import { parseRetryAfterSeconds, SpotifyApiError } from '@/lib/spotify/errors';
import {
  loadSpotifySavedTracksPage,
  SavedTracksSessionRefreshRequired,
} from '@/lib/spotify/saved-tracks';
import { ensureFreshSpotifySession, SpotifyTokenRefreshError } from '@/lib/spotify/tokens';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
};

function redirectResponse(location: string): NextResponse {
  return new NextResponse(null, {
    headers: {
      ...NO_STORE_HEADERS,
      Location: location,
    },
    status: 303,
  });
}

function invalidRequestResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Invalid Spotify refresh request.' },
    {
      headers: NO_STORE_HEADERS,
      status: 400,
    },
  );
}

async function clearSessionSafely(): Promise<void> {
  try {
    await deleteSession();
  } catch {
    // Preserve a user-safe redirect even if cookie deletion unexpectedly fails.
  }
}

function dashboardErrorRedirect(code: string, retryAfter: number | null = null): NextResponse {
  const searchParams = new URLSearchParams({ spotifyError: code });

  if (retryAfter !== null) {
    searchParams.set('retryAfter', String(retryAfter));
  }

  return redirectResponse(`/dashboard?${searchParams.toString()}`);
}

async function refreshErrorResponse(error: unknown): Promise<NextResponse> {
  if (error instanceof SpotifyTokenRefreshError) {
    if (error.kind === 'permanent') {
      await clearSessionSafely();

      return redirectResponse('/?spotifyError=authorization_expired');
    }

    if (error.status === 429) {
      return dashboardErrorRedirect('rate_limited', parseRetryAfterSeconds(error.retryAfter));
    }

    return dashboardErrorRedirect('temporarily_unavailable');
  }

  if (error instanceof SpotifyApiError) {
    if (error.kind === 'unauthorized') {
      await clearSessionSafely();

      return redirectResponse('/?spotifyError=authorization_expired');
    }

    if (error.kind === 'forbidden') {
      return dashboardErrorRedirect('authorization_expired');
    }

    if (error.kind === 'rate_limited') {
      return dashboardErrorRedirect('rate_limited', error.retryAfter);
    }

    return dashboardErrorRedirect('temporarily_unavailable');
  }

  if (error instanceof SavedTracksSessionRefreshRequired) {
    return dashboardErrorRedirect('temporarily_unavailable');
  }

  return dashboardErrorRedirect('unexpected_failure');
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const fetchSite = request.headers.get('sec-fetch-site');

  if (fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return NextResponse.json(
      { error: 'Invalid Spotify refresh request.' },
      {
        headers: NO_STORE_HEADERS,
        status: 403,
      },
    );
  }

  const forceValues = request.nextUrl.searchParams.getAll('force');

  if (
    forceValues.length > 1 ||
    (forceValues.length === 1 && forceValues[0] !== '1') ||
    [...request.nextUrl.searchParams.keys()].some((key) => key !== 'force')
  ) {
    return invalidRequestResponse();
  }

  let session: Awaited<ReturnType<typeof readSession>>;

  try {
    session = await readSession();
  } catch {
    return redirectResponse('/');
  }

  if (!session) {
    return redirectResponse('/');
  }

  const force = forceValues[0] === '1';

  try {
    const refreshedSession = await ensureFreshSpotifySession(session, { force });

    if (force) {
      await loadSpotifySavedTracksPage(
        refreshedSession,
        { limit: 1, offset: 0 },
        {
          forcedRefreshCompleted: true,
          refreshMode: 'signal',
        },
      );
    }

    return redirectResponse(force ? '/dashboard?spotifyRefresh=forced' : '/dashboard');
  } catch (error) {
    return refreshErrorResponse(error);
  }
}
