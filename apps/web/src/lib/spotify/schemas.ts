import { z } from 'zod';

function hasHttpsProtocol(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function isSpotifyTrackUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return url.hostname === 'open.spotify.com' && url.pathname.startsWith('/track/');
  } catch {
    return false;
  }
}

const httpsUrlSchema = z.string().url().refine(hasHttpsProtocol, 'Expected an HTTPS URL');

const spotifyWebUrlSchema = httpsUrlSchema.refine(
  isSpotifyTrackUrl,
  'Expected a Spotify track URL',
);

const spotifyImageSchema = z.object({
  url: httpsUrlSchema,
});

const spotifyArtistSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
});

const spotifyAlbumSchema = z.object({
  id: z.string().min(1),
  images: z.array(spotifyImageSchema),
  name: z.string(),
});

const spotifyTrackSchema = z.object({
  album: spotifyAlbumSchema,
  artists: z.array(spotifyArtistSchema).min(1),
  duration_ms: z.number().int().nonnegative(),
  explicit: z.boolean(),
  external_urls: z.object({
    spotify: spotifyWebUrlSchema,
  }),
  id: z.string().min(1),
  name: z.string(),
});

const spotifySavedTrackSchema = z.object({
  added_at: z.string().datetime({ offset: true }),
  track: spotifyTrackSchema,
});

export const spotifyProfileResponseSchema = z.object({
  account_id: z.string().min(1),
  display_name: z.string().nullable().optional(),
  images: z.array(spotifyImageSchema).optional().default([]),
});

export const spotifySavedTracksResponseSchema = z.object({
  items: z.array(spotifySavedTrackSchema),
  limit: z.number().int().nonnegative().max(50),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});

export type SpotifyProfileResponse = z.infer<typeof spotifyProfileResponseSchema>;
export type SpotifySavedTracksResponse = z.infer<typeof spotifySavedTracksResponseSchema>;
