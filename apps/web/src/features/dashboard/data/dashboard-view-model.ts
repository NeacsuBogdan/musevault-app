import type { SpotifyProfile } from '@/types/spotify';

import type { PersistedDashboardSnapshot } from '@/lib/db/repositories/persisted-library';
import type {
  DashboardProfile,
  DashboardRecentTrack,
  DashboardStatistic,
  DashboardViewModel,
} from '../types';

const SPOTIFY_IMAGE_HOST = 'i.scdn.co';
const SPOTIFY_TRACK_HOST = 'open.spotify.com';
const FALLBACK_DISPLAY_NAME = 'Spotify listener';

export type DashboardProfileInput = Pick<SpotifyProfile, 'displayName' | 'imageUrl'>;
export type PersistedDashboardInput = PersistedDashboardSnapshot;

function isSafeSpotifyImageUrl(value: string | null): value is string {
  if (value === null) return false;
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
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

function toRecentTrack(
  track: PersistedDashboardInput['recentlySaved'][number],
): DashboardRecentTrack {
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
  snapshot: PersistedDashboardInput,
): DashboardViewModel {
  const averageDurationMs =
    snapshot.savedTrackCount > 0 ? snapshot.totalDurationMs / snapshot.savedTrackCount : 0;
  const statistics: readonly DashboardStatistic[] = [
    {
      label: 'Liked Songs',
      value: displayInteger(snapshot.savedTrackCount),
      helper: 'Saved tracks in your synced library',
      icon: 'heart',
      accent: 'green',
    },
    {
      label: 'Artists',
      value: displayInteger(snapshot.uniqueArtistCount),
      helper: 'Unique artists across your synced library',
      icon: 'artists',
      accent: 'pink',
    },
    {
      label: 'Library Duration',
      value: formatDashboardDuration(snapshot.totalDurationMs),
      helper: 'Combined duration of your synced library',
      icon: 'clock',
      accent: 'blue',
    },
    {
      label: 'Average Track Length',
      value: formatDashboardDuration(averageDurationMs),
      helper: 'Average duration across saved tracks',
      icon: 'music',
      accent: 'purple',
    },
  ];
  return {
    profile: createDashboardProfile(profile),
    statistics,
    recentlySaved: snapshot.recentlySaved.slice(0, 5).map(toRecentTrack),
    savedTrackCount: snapshot.savedTrackCount,
    lastSuccessfulSyncAt: snapshot.lastSuccessfulSyncAt,
    latestFullSyncAt: snapshot.latestFullSyncAt,
  };
}
