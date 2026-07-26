import type { SavedTrack, SavedTracksPage, SpotifyProfile } from '@/types/spotify';

import type { SpotifyProfileResponse, SpotifySavedTracksResponse } from './schemas';

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

function normalizeSavedTrack(item: SpotifySavedTracksResponse['items'][number]): SavedTrack {
  return {
    id: item.track.id,
    spotifyUrl: item.track.external_urls.spotify,
    name: item.track.name,
    artistIds: item.track.artists.map((artist) => artist.id),
    artistNames: item.track.artists.map((artist) => artist.name),
    albumName: item.track.album.name,
    albumImageUrl: safeSpotifyImageUrl(item.track.album.images),
    durationMs: item.track.duration_ms,
    explicit: item.track.explicit,
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
