import { NextResponse } from 'next/server';
import { z } from 'zod';
import { readSession } from '@/lib/auth/session';
import { isSameOriginWrite } from '@/lib/auth/same-origin';
import { getSmartPlaylistPreview } from '@/lib/db/repositories/smart-playlists';
import { getSpotifyPlaylistExportCapability } from '@/lib/db/repositories/spotify-playlist-export';
import { getServerEnv } from '@/lib/env';
import { parseSmartPlaylistInput } from '@/lib/smart-playlists/definitions';
import {
  playlistNameSchema,
  spotifyPlaylistIdSchema,
  type PlaylistExportErrorCode,
  type PlaylistExportResponse,
} from '@/lib/smart-playlists/export-contract';
import { parseRetryAfterSeconds, SpotifyApiError } from '@/lib/spotify/errors';
import {
  addItemsToPlaylist,
  createPrivatePlaylist,
  SpotifyPlaylistVisibilityError,
} from '@/lib/spotify/playlists';
import { ensureFreshSpotifySession, SpotifyTokenRefreshError } from '@/lib/spotify/tokens';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
const inputValue = z.union([z.string().max(128), z.array(z.string().max(128)).max(2)]).optional();
const definitionSchema = z
  .object({
    preset: inputValue,
    tempoMin: inputValue,
    tempoMax: inputValue,
    energyMin: inputValue,
    energyMax: inputValue,
    valenceMin: inputValue,
    valenceMax: inputValue,
    danceabilityMin: inputValue,
    danceabilityMax: inputValue,
    acousticnessMin: inputValue,
    acousticnessMax: inputValue,
    instrumentalnessMin: inputValue,
    instrumentalnessMax: inputValue,
    sort: inputValue,
    limit: inputValue,
  })
  .strict();
const bodySchema = z.object({ name: z.unknown(), definition: z.unknown() }).strict();

function reply(body: PlaylistExportResponse, status: number) {
  const responseHeaders = new Headers(headers);
  if (body.state !== 'success' && body.error.retryAfter !== null)
    responseHeaders.set('Retry-After', String(body.error.retryAfter));
  return NextResponse.json(body, { status, headers: responseHeaders });
}
function failure(code: PlaylistExportErrorCode, status: number, retryAfter: number | null = null) {
  return reply({ state: 'error', error: { code, retryAfter } }, status);
}

function remoteFailure(error: unknown, createAttempted: boolean) {
  if (error instanceof SpotifyTokenRefreshError) {
    if (error.requiresReconnect)
      return { code: 'reauthorization_required' as const, status: 403, retryAfter: null };
    if (error.status === 429)
      return {
        code: 'rate_limited' as const,
        status: 429,
        retryAfter: parseRetryAfterSeconds(error.retryAfter),
      };
    return { code: 'spotify_unavailable' as const, status: 503, retryAfter: null };
  }
  if (error instanceof SpotifyApiError) {
    if (error.kind === 'unauthorized' || error.kind === 'forbidden')
      return { code: 'reauthorization_required' as const, status: 403, retryAfter: null };
    if (error.kind === 'rate_limited')
      return { code: 'rate_limited' as const, status: 429, retryAfter: error.retryAfter };
    // A failed response/read after sending a write may still represent a remote mutation.
    if (error.category === 'http' && error.status !== null && error.status < 500)
      return { code: 'spotify_unavailable' as const, status: 502, retryAfter: null };
  }
  return {
    code: createAttempted ? ('export_uncertain' as const) : ('unexpected_failure' as const),
    status: createAttempted ? 502 : 500,
    retryAfter: null,
  };
}

export async function POST(request: Request) {
  let created: Awaited<ReturnType<typeof createPrivatePlaylist>> | null = null;
  let createAttempted = false;
  try {
    const session = await readSession();
    if (!session) return failure('unauthenticated', 401);
    if (!isSameOriginWrite(request, getServerEnv().APP_URL)) return failure('invalid_request', 403);
    if (
      request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !==
      'application/json'
    )
      return failure('invalid_body', 400);
    const body = bodySchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return failure('invalid_body', 400);
    const name = playlistNameSchema.safeParse(body.data.name);
    if (!name.success) return failure('invalid_name', 400);
    const input = definitionSchema.safeParse(body.data.definition);
    if (!input.success) return failure('invalid_definition', 400);
    const parsed = parseSmartPlaylistInput(input.data);
    if (parsed.kind !== 'definition') return failure('invalid_definition', 400);
    if (!(await getSpotifyPlaylistExportCapability(session.accountId)))
      return failure('reauthorization_required', 403);

    const preview = await getSmartPlaylistPreview(session.accountId, input.data);
    if (preview.state !== 'success') return failure('preview_unavailable', 409);
    if (!preview.tracks.length) return failure('empty_preview', 409);
    const resolvedIds = z
      .array(spotifyPlaylistIdSchema)
      .min(1)
      .max(parsed.definition.limit)
      .safeParse(preview.tracks.map((track) => track.trackId));
    if (!resolvedIds.success || new Set(resolvedIds.data).size !== resolvedIds.data.length)
      return failure('preview_unavailable', 409);

    let freshSession = await ensureFreshSpotifySession(session);
    let refreshedAfter401 = false;
    async function writeWith401Retry<T>(
      operation: (accessToken: string) => Promise<T>,
    ): Promise<T> {
      try {
        return await operation(freshSession.accessToken);
      } catch (error) {
        if (
          !(error instanceof SpotifyApiError) ||
          error.status !== 401 ||
          error.category !== 'http' ||
          refreshedAfter401
        )
          throw error;
        // Only an explicit rejection confirms this operation was not performed.
        refreshedAfter401 = true;
        freshSession = await ensureFreshSpotifySession(freshSession, { force: true });
        return operation(freshSession.accessToken);
      }
    }
    createAttempted = true;
    created = await writeWith401Retry((accessToken) =>
      createPrivatePlaylist(accessToken, name.data),
    );
    await writeWith401Retry((accessToken) =>
      addItemsToPlaylist(accessToken, created!.id, resolvedIds.data),
    );
    return reply({ state: 'success', playlist: created, trackCount: resolvedIds.data.length }, 201);
  } catch (error) {
    if (error instanceof SpotifyPlaylistVisibilityError)
      return reply(
        {
          state: 'partial_failure',
          playlist: error.playlist,
          error: { code: 'wrong_visibility', retryAfter: null },
        },
        502,
      );
    const safe = remoteFailure(error, createAttempted);
    if (created)
      return reply(
        {
          state: 'partial_failure',
          playlist: created,
          error: { code: safe.code, retryAfter: safe.retryAfter },
        },
        safe.status,
      );
    return failure(safe.code, safe.status, safe.retryAfter);
  }
}
