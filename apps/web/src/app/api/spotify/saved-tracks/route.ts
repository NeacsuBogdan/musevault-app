import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { deleteSession, readSession } from '@/lib/auth/session';
import { parseRetryAfterSeconds, SpotifyApiError } from '@/lib/spotify/errors';
import { loadSpotifySavedTracksPage } from '@/lib/spotify/saved-tracks';
import { SpotifyTokenRefreshError } from '@/lib/spotify/tokens';
import type { SavedTracksErrorCode, SavedTracksErrorResponse } from '@/types/spotify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const querySchema = z.object({
  limit: z
    .string()
    .regex(/^(?:[1-9]|[1-4]\d|50)$/)
    .transform(Number),
  offset: z
    .string()
    .regex(/^(?:0|[1-9]\d*)$/)
    .refine((value) => Number.isSafeInteger(Number(value)))
    .transform(Number),
});

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
};

function errorResponse(
  code: SavedTracksErrorCode,
  message: string,
  status: number,
  retryAfter: number | null = null,
): NextResponse<SavedTracksErrorResponse> {
  const headers = new Headers(NO_STORE_HEADERS);
  const error: SavedTracksErrorResponse['error'] = { code, message };

  if (retryAfter !== null) {
    error.retryAfter = retryAfter;
    headers.set('Retry-After', String(retryAfter));
  }

  return NextResponse.json({ error }, { status, headers });
}

async function clearSessionSafely(): Promise<void> {
  try {
    await deleteSession();
  } catch {
    // Keep the response safe even if clearing a malformed cookie unexpectedly fails.
  }
}

async function handleRequestError(error: unknown): Promise<NextResponse<SavedTracksErrorResponse>> {
  if (error instanceof SpotifyTokenRefreshError) {
    if (error.kind === 'permanent') {
      await clearSessionSafely();

      return errorResponse(
        'spotify_authorization_expired',
        'Your Spotify connection has expired. Connect again to continue.',
        401,
      );
    }

    if (error.status === 429) {
      return errorResponse(
        'spotify_rate_limited',
        'Spotify is temporarily rate limiting requests. Please try again later.',
        429,
        parseRetryAfterSeconds(error.retryAfter),
      );
    }

    return errorResponse(
      'spotify_unavailable',
      'Spotify is temporarily unavailable. Please try again.',
      503,
    );
  }

  if (error instanceof SpotifyApiError) {
    if (error.kind === 'unauthorized') {
      await clearSessionSafely();

      return errorResponse(
        'spotify_authorization_expired',
        'Your Spotify connection has expired. Connect again to continue.',
        401,
      );
    }

    if (error.kind === 'forbidden') {
      return errorResponse(
        'spotify_forbidden',
        'Spotify denied access to saved tracks. Reconnect and approve library access.',
        403,
      );
    }

    if (error.kind === 'rate_limited') {
      return errorResponse(
        'spotify_rate_limited',
        'Spotify is temporarily rate limiting requests. Please try again later.',
        429,
        error.retryAfter,
      );
    }

    return errorResponse(
      'spotify_unavailable',
      'Spotify returned an unexpected response. Please try again.',
      502,
    );
  }

  return errorResponse(
    'internal_error',
    'MuseVault could not load your saved tracks. Please try again.',
    500,
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = querySchema.safeParse({
    limit: request.nextUrl.searchParams.get('limit') ?? '50',
    offset: request.nextUrl.searchParams.get('offset') ?? '0',
  });

  if (!query.success) {
    return errorResponse(
      'invalid_request',
      'Use an integer limit from 1 to 50 and a non-negative integer offset.',
      400,
    );
  }

  let session: Awaited<ReturnType<typeof readSession>>;

  try {
    session = await readSession();
  } catch {
    return errorResponse(
      'internal_error',
      'MuseVault could not validate your Spotify session. Please try again.',
      500,
    );
  }

  if (session === null) {
    return errorResponse('unauthenticated', 'Connect Spotify to view your saved tracks.', 401);
  }

  try {
    const page = await loadSpotifySavedTracksPage(session, query.data);

    return NextResponse.json(page, { headers: NO_STORE_HEADERS });
  } catch (error) {
    return handleRequestError(error);
  }
}
