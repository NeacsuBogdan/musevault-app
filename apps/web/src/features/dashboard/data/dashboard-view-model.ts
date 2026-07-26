import type { SavedTracksPage, SpotifyProfile } from '@/types/spotify';

import type {
  DashboardProfile,
  DashboardRecentTrack,
  DashboardStatistic,
  DashboardViewModel,
} from '../types';

const MAX_LOADED_TRACKS = 50;
const RECENTLY_SAVED_LIMIT = 5;
const SPOTIFY_IMAGE_HOST = 'i.scdn.co';
const SPOTIFY_TRACK_HOST = 'open.spotify.com';
const FALLBACK_DISPLAY_NAME = 'Spotify listener';

export type DashboardProfileInput = Pick<SpotifyProfile, 'displayName' | 'imageUrl'>;

function isSafeSpotifyImageUrl(value: string | null): value is string {
  if (value === null) {
    return false;
  }

  try {
    const url = new URL(value);

    return url.protocol === 'https:' && url.hostname === SPOTIFY_IMAGE_HOST;
  } catch {
    return false;
  }
}

function isSafeSpotifyTrackUrl(value: string): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' &&
      url.hostname === SPOTIFY_TRACK_HOST &&
      url.pathname.startsWith('/track/')
    );
  } catch {
    return false;
  }
}

function displayInteger(value: number): string {
  const safeValue = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

  return new Intl.NumberFormat('en-US').format(safeValue);
}

function previewBasisHelper(trackCount: number): string {
  if (trackCount === 0) {
    return 'Based on an empty saved-tracks preview';
  }

  return `Based on the latest ${trackCount} saved track${trackCount === 1 ? '' : 's'}`;
}

export function createDashboardProfile(input: DashboardProfileInput): DashboardProfile {
  const displayName = input.displayName.trim() || FALLBACK_DISPLAY_NAME;
  const nameParts = displayName.split(/\s+/);
  const firstName = nameParts[0] ?? FALLBACK_DISPLAY_NAME;
  const initials =
    nameParts
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toLocaleUpperCase() || 'S';

  return {
    displayName,
    firstName,
    initials,
    imageUrl: isSafeSpotifyImageUrl(input.imageUrl) ? input.imageUrl : null,
  };
}

export function formatDashboardDuration(durationMs: number): string {
  const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const totalMinutes = Math.floor(safeDuration / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

function toRecentTrack(track: SavedTracksPage['items'][number]): DashboardRecentTrack {
  return {
    id: track.id,
    name: track.name,
    artistNames: [...track.artistNames],
    albumName: track.albumName,
    albumImageUrl: isSafeSpotifyImageUrl(track.albumImageUrl) ? track.albumImageUrl : null,
    spotifyUrl: isSafeSpotifyTrackUrl(track.spotifyUrl) ? track.spotifyUrl : null,
    savedAt: track.savedAt,
  };
}

export function createDashboardViewModel(
  profile: DashboardProfileInput,
  savedTracksPage: SavedTracksPage,
): DashboardViewModel {
  const loadedTracks = savedTracksPage.items.slice(0, MAX_LOADED_TRACKS);
  const loadedTrackCount = loadedTracks.length;
  const artistIds = new Set(
    loadedTracks.flatMap((track) => track.artistIds.filter((artistId) => artistId.length > 0)),
  );
  const previewDurationMs = loadedTracks.reduce(
    (total, track) =>
      total + (Number.isFinite(track.durationMs) ? Math.max(0, track.durationMs) : 0),
    0,
  );
  const previewHelper = previewBasisHelper(loadedTrackCount);
  const statistics: readonly DashboardStatistic[] = [
    {
      label: 'Liked Songs',
      value: displayInteger(savedTracksPage.total),
      helper: 'Total saved tracks reported by Spotify',
      icon: 'heart',
      accent: 'green',
    },
    {
      label: 'Loaded Tracks',
      value: displayInteger(loadedTrackCount),
      helper: 'Latest saved tracks loaded, up to 50',
      icon: 'music',
      accent: 'purple',
    },
    {
      label: 'Artists in Preview',
      value: displayInteger(artistIds.size),
      helper: previewHelper,
      icon: 'artists',
      accent: 'pink',
    },
    {
      label: 'Preview Duration',
      value: formatDashboardDuration(previewDurationMs),
      helper: previewHelper,
      icon: 'clock',
      accent: 'blue',
    },
  ];

  return {
    profile: createDashboardProfile(profile),
    statistics,
    recentlySaved: loadedTracks.slice(0, RECENTLY_SAVED_LIMIT).map(toRecentTrack),
    loadedTrackCount,
  };
}
