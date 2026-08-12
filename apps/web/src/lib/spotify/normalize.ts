import type {
  RecentlyPlayedPage,
  SavedTrack,
  SavedTracksPage,
  SpotifyCatalogTrack,
  SpotifyProfile,
} from '@/types/spotify';

import type {
  SpotifyProfileResponse,
  SpotifyRecentlyPlayedResponse,
  SpotifySavedTracksResponse,
  SpotifyTrackResponse,
} from './schemas';

const SPOTIFY_IMAGE_HOST = 'i.scdn.co';
const FALLBACK_DISPLAY_NAME = 'Spotify listener';

function safeSpotifyImageUrl(images: ReadonlyArray<{ url: string }>): string | null {
  const image = images.find((candidate) => {
    const url = new URL(candidate.url);

    return url.protocol === 'https:' && url.hostname === SPOTIFY_IMAGE_HOST;
  });

  return image?.url ?? null;
}

export function normalizeSpotifyProfile(profile: SpotifyProfileResponse): SpotifyProfile {
  return {
    accountId: profile.account_id,
    displayName: profile.display_name?.trim() || FALLBACK_DISPLAY_NAME,
    imageUrl: safeSpotifyImageUrl(profile.images),
  };
}

export function normalizeSpotifyCatalogTrack(track: SpotifyTrackResponse): SpotifyCatalogTrack {
  return {
    id: track.id,
    albumId: track.album.id,
    spotifyUrl: track.external_urls.spotify,
    name: track.name,
    artistIds: track.artists.map((artist) => artist.id),
    artistNames: track.artists.map((artist) => artist.name),
    albumName: track.album.name,
    albumImageUrl: safeSpotifyImageUrl(track.album.images),
    durationMs: track.duration_ms,
    explicit: track.explicit,
  };
}

function normalizeSavedTrack(item: SpotifySavedTracksResponse['items'][number]): SavedTrack {
  return {
    ...normalizeSpotifyCatalogTrack(item.track),
    savedAt: item.added_at,
  };
}

export function normalizeSpotifySavedTracks(response: SpotifySavedTracksResponse): SavedTracksPage {
  return {
    items: response.items.map(normalizeSavedTrack),
    total: response.total,
    limit: response.limit,
    offset: response.offset,
  };
}

function safeContextUrl(value: string | undefined): string | null {
  if (!value) return null;
  const url = new URL(value);
  const allowed = ['/album/', '/artist/', '/playlist/', '/collection/', '/show/', '/episode/'];
  return url.protocol === 'https:' &&
    url.hostname === 'open.spotify.com' &&
    allowed.some((prefix) => url.pathname.startsWith(prefix))
    ? value
    : null;
}

export function normalizeSpotifyRecentlyPlayed(
  response: SpotifyRecentlyPlayedResponse,
): RecentlyPlayedPage {
  return {
    items: response.items.map((item) => ({
      track: normalizeSpotifyCatalogTrack(item.track),
      playedAt: new Date(item.played_at).toISOString(),
      context: item.context
        ? {
            type: item.context.type,
            uri: item.context.uri,
            spotifyUrl: safeContextUrl(item.context.external_urls?.spotify),
          }
        : null,
    })),
    cursors: {
      after: response.cursors?.after ?? null,
      before: response.cursors?.before ?? null,
    },
    hasNext: response.next != null,
  };
}
