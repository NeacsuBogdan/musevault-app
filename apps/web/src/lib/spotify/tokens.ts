import 'server-only';

import { createHash } from 'node:crypto';

import { z } from 'zod';

import { deleteSession, type SpotifySession, writeSession } from '@/lib/auth/session';
import { getServerEnv } from '@/lib/env';

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 60_000;

const refreshTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  refresh_token: z.string().min(1).optional(),
  token_type: z.string().toLowerCase().pipe(z.literal('bearer')),
});

const refreshTokenErrorSchema = z.object({
  error: z.string(),
});

export interface EnsureFreshSpotifySessionOptions {
  force?: boolean;
}

export type SpotifyTokenRefreshErrorKind = 'permanent' | 'transient';

export class SpotifyTokenRefreshError extends Error {
  readonly kind: SpotifyTokenRefreshErrorKind;
  readonly retryAfter: string | null;
  readonly status: number | null;

  constructor(
    message: string,
    options: {
      kind: SpotifyTokenRefreshErrorKind;
      retryAfter?: string | null;
      status?: number | null;
    },
  ) {
    super(message);
    this.name = 'SpotifyTokenRefreshError';
    this.kind = options.kind;
    this.retryAfter = options.retryAfter ?? null;
    this.status = options.status ?? null;
  }

  get requiresReconnect(): boolean {
    return this.kind === 'permanent';
  }
}

const refreshesInFlight = new Map<string, Promise<SpotifySession>>();

export function shouldRefreshAccessToken(
  session: SpotifySession,
  nowMilliseconds = Date.now(),
): boolean {
  return session.expiresAt <= nowMilliseconds + ACCESS_TOKEN_REFRESH_BUFFER_MS;
}

export function mergeSpotifyTokenRefresh(
  session: SpotifySession,
  responseBody: unknown,
  nowMilliseconds = Date.now(),
): SpotifySession {
  const refreshedToken = refreshTokenResponseSchema.parse(responseBody);

  return {
    ...session,
    accessToken: refreshedToken.access_token,
    expiresAt: nowMilliseconds + refreshedToken.expires_in * 1_000,
    refreshToken: refreshedToken.refresh_token ?? session.refreshToken,
  };
}

async function readJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function classifySpotifyRefreshFailure(
  response: Pick<Response, 'headers' | 'status'>,
  responseBody: unknown,
): SpotifyTokenRefreshError {
  const parsedError = refreshTokenErrorSchema.safeParse(responseBody);
  const permanent =
    response.status === 400 && parsedError.success && parsedError.data.error === 'invalid_grant';

  return new SpotifyTokenRefreshError(
    permanent
      ? 'Spotify authorization is no longer valid.'
      : 'Spotify token refresh is temporarily unavailable.',
    {
      kind: permanent ? 'permanent' : 'transient',
      retryAfter: response.headers.get('retry-after'),
      status: response.status,
    },
  );
}

async function refreshSpotifySession(session: SpotifySession): Promise<SpotifySession> {
  const environment = getServerEnv();
  let response: Response;

  try {
    response = await fetch(SPOTIFY_TOKEN_URL, {
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: session.refreshToken,
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
    throw new SpotifyTokenRefreshError('Spotify token refresh is temporarily unavailable.', {
      kind: 'transient',
    });
  }

  const responseBody = await readJsonResponse(response);

  if (!response.ok) {
    throw classifySpotifyRefreshFailure(response, responseBody);
  }

  try {
    return mergeSpotifyTokenRefresh(session, responseBody);
  } catch {
    throw new SpotifyTokenRefreshError('Spotify returned an invalid token response.', {
      kind: 'transient',
      status: response.status,
    });
  }
}

/**
 * Returns a usable access-token session and persists a refresh when one was needed.
 *
 * Concurrent requests for the same account share the same refresh request. Every
 * caller writes the refreshed JWE into its own response context after awaiting it.
 */
export async function ensureFreshSpotifySession(
  session: SpotifySession,
  options: EnsureFreshSpotifySessionOptions = {},
): Promise<SpotifySession> {
  if (!options.force && !shouldRefreshAccessToken(session)) {
    return session;
  }

  const refreshKey = createHash('sha256').update(session.refreshToken, 'utf8').digest('base64url');
  let refresh = refreshesInFlight.get(refreshKey);

  if (!refresh) {
    refresh = refreshSpotifySession(session);
    refreshesInFlight.set(refreshKey, refresh);
  }

  try {
    const refreshedSession = await refresh;
    await writeSession(refreshedSession);

    return refreshedSession;
  } catch (error) {
    if (error instanceof SpotifyTokenRefreshError && error.requiresReconnect) {
      try {
        await deleteSession();
      } catch {
        // Preserve the recognizable refresh error if cookie mutation itself fails.
      }
    }

    throw error;
  } finally {
    if (refreshesInFlight.get(refreshKey) === refresh) {
      refreshesInFlight.delete(refreshKey);
    }
  }
}
