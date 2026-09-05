import 'server-only';

import { z, type ZodType } from 'zod';

import {
  sanitizeSpotifySchemaIssues,
  SpotifyApiError,
  spotifyApiErrorFromResponse,
} from './errors';

const SPOTIFY_API_BASE_URL = 'https://api.spotify.com/v1';
const PLAYLIST_DESCRIPTION = 'Created with MuseVault from your saved Spotify library.';
const REQUEST_TIMEOUT_MS = 15_000;

function hasNoControlCharacters(value: string): boolean {
  return [...value].every((character) => {
    const code = character.charCodeAt(0);
    return code >= 32 && (code < 127 || code > 159);
  });
}

const spotifyIdSchema = z.string().regex(/^[A-Za-z0-9]{22}$/);
const playlistNameSchema = z.string().refine(hasNoControlCharacters).trim().min(1).max(100);
const createPlaylistRequestSchema = z
  .object({
    name: playlistNameSchema,
    description: z.literal(PLAYLIST_DESCRIPTION),
    public: z.literal(false),
  })
  .strict();
const createPlaylistResponseSchema = z
  .object({
    id: spotifyIdSchema,
    name: playlistNameSchema,
    public: z.boolean(),
    external_urls: z.object({ spotify: z.string() }),
  })
  .refine(
    (playlist) =>
      playlist.external_urls.spotify === `https://open.spotify.com/playlist/${playlist.id}`,
    { path: ['external_urls', 'spotify'] },
  );
const addItemsResponseSchema = z.object({
  snapshot_id: z.string().refine(hasNoControlCharacters).trim().min(1).max(1024),
});

export interface CreatedSpotifyPlaylist {
  id: string;
  name: string;
  url: string;
}

export class SpotifyPlaylistVisibilityError extends Error {
  constructor(public readonly playlist: CreatedSpotifyPlaylist) {
    super('Spotify did not confirm private playlist visibility.');
    this.name = 'SpotifyPlaylistVisibilityError';
  }
}

// Writes are deliberately attempted once. The caller may refresh and retry only
// after an explicit HTTP 401; network and response failures can be ambiguous.
async function postSpotifyJson<T>(
  path: string,
  accessToken: string,
  serializedBody: string,
  schema: ZodType<T>,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${SPOTIFY_API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: serializedBody,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new SpotifyApiError('unavailable', null, null, 'network');
  }

  if (!response.ok) {
    throw spotifyApiErrorFromResponse(response);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new SpotifyApiError('invalid_response', response.status, null, 'json');
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new SpotifyApiError(
      'invalid_response',
      response.status,
      null,
      'schema',
      sanitizeSpotifySchemaIssues(parsed.error.issues),
    );
  }
  return parsed.data;
}

export async function createPrivatePlaylist(
  accessToken: string,
  name: string,
): Promise<CreatedSpotifyPlaylist> {
  const parsedName = playlistNameSchema.safeParse(name);
  if (!parsedName.success) {
    throw new Error('Invalid playlist name.');
  }

  const playlist = await postSpotifyJson(
    '/me/playlists',
    accessToken,
    JSON.stringify(
      createPlaylistRequestSchema.parse({
        name: parsedName.data,
        description: PLAYLIST_DESCRIPTION,
        public: false,
      }),
    ),
    createPlaylistResponseSchema,
  );
  const created = {
    id: playlist.id,
    name: playlist.name,
    url: playlist.external_urls.spotify,
  };
  if (playlist.public !== false) throw new SpotifyPlaylistVisibilityError(created);
  return created;
}

export async function addItemsToPlaylist(
  accessToken: string,
  playlistId: string,
  trackIds: readonly string[],
): Promise<void> {
  const parsedPlaylistId = spotifyIdSchema.safeParse(playlistId);
  const parsedTrackIds = z.array(spotifyIdSchema).min(1).max(50).safeParse(trackIds);
  if (!parsedPlaylistId.success || !parsedTrackIds.success) {
    throw new Error('Invalid playlist items.');
  }

  await postSpotifyJson(
    `/playlists/${parsedPlaylistId.data}/items`,
    accessToken,
    JSON.stringify({ uris: parsedTrackIds.data.map((id) => `spotify:track:${id}`) }),
    addItemsResponseSchema,
  );
}
