import { z } from 'zod';

export const PLAYLIST_NAME_MAX_LENGTH = 100;
export const playlistNameSchema = z
  .string()
  .refine((value) =>
    [...value].every((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && (code < 127 || code > 159);
    }),
  )
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(PLAYLIST_NAME_MAX_LENGTH));

export const spotifyPlaylistIdSchema = z.string().regex(/^[A-Za-z0-9]{22}$/);
export const exportedPlaylistSchema = z
  .object({
    id: spotifyPlaylistIdSchema,
    name: playlistNameSchema,
    url: z.string(),
  })
  .strict()
  .refine((playlist) => playlist.url === `https://open.spotify.com/playlist/${playlist.id}`);

const exportErrorSchema = z.object({
  code: z.enum([
    'unauthenticated',
    'invalid_request',
    'invalid_body',
    'invalid_name',
    'invalid_definition',
    'reauthorization_required',
    'preview_unavailable',
    'empty_preview',
    'rate_limited',
    'spotify_unavailable',
    'wrong_visibility',
    'export_uncertain',
    'unexpected_failure',
  ]),
  retryAfter: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable(),
});
export const playlistExportResponseSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('success'),
    playlist: exportedPlaylistSchema,
    trackCount: z.number().int().min(1).max(50),
  }),
  z.object({
    state: z.literal('partial_failure'),
    playlist: exportedPlaylistSchema,
    error: exportErrorSchema,
  }),
  z.object({ state: z.literal('error'), error: exportErrorSchema }),
]);
export type PlaylistExportResponse = z.infer<typeof playlistExportResponseSchema>;
export type PlaylistExportErrorCode = z.infer<typeof exportErrorSchema>['code'];
