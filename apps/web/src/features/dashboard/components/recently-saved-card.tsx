import Image from 'next/image';
import { CircleAlert, ExternalLink, Music2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

import type { DashboardRecentTrack } from '../types';

interface RecentlySavedCardProps {
  headingId: string;
  tracks: readonly DashboardRecentTrack[] | null;
}

const savedDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

function isAllowedSpotifyImage(imageUrl: string | null): imageUrl is string {
  if (!imageUrl) {
    return false;
  }

  try {
    const url = new URL(imageUrl);

    return url.protocol === 'https:' && url.hostname === 'i.scdn.co';
  } catch {
    return false;
  }
}

function isAllowedSpotifyTrackUrl(spotifyUrl: string | null): spotifyUrl is string {
  if (!spotifyUrl) {
    return false;
  }

  try {
    const url = new URL(spotifyUrl);

    return (
      url.protocol === 'https:' &&
      url.hostname === 'open.spotify.com' &&
      url.pathname.startsWith('/track/')
    );
  } catch {
    return false;
  }
}

function formatSavedDate(savedAt: string): string {
  const date = new Date(savedAt);

  return Number.isNaN(date.getTime()) ? 'Saved date unavailable' : savedDateFormatter.format(date);
}

export function RecentlySavedCard({ headingId, tracks }: RecentlySavedCardProps) {
  return (
    <Card variant="elevated" padding="md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-[0.1em] text-accent-green">
            Latest library page
          </p>
          <h2 id={headingId} className="mt-1.5 text-card-title font-semibold text-text-primary">
            Recently Saved
          </h2>
        </div>
        <Badge tone={tracks === null ? 'yellow' : 'green'}>
          {tracks === null ? 'Unavailable' : 'Spotify data'}
        </Badge>
      </div>

      {tracks === null ? (
        <div
          role="status"
          className="mt-5 rounded-card border border-dashed border-border-strong bg-surface px-4 py-8 text-center"
        >
          <CircleAlert aria-hidden="true" size={20} className="mx-auto text-accent-yellow" />
          <p className="mt-3 text-body-sm font-semibold text-text-primary">
            Recently saved tracks are unavailable
          </p>
          <p className="mt-1 text-caption leading-5 text-text-secondary">
            The library could not be loaded, so MuseVault is not presenting it as empty. Reload the
            dashboard to try again.
          </p>
        </div>
      ) : tracks.length === 0 ? (
        <div className="mt-5 rounded-card border border-dashed border-border-strong bg-surface px-4 py-8 text-center">
          <Music2 aria-hidden="true" size={20} className="mx-auto text-text-muted" />
          <p className="mt-3 text-body-sm font-semibold text-text-primary">No saved tracks yet</p>
          <p className="mt-1 text-caption leading-5 text-text-secondary">
            Save a song on Spotify, then reload this dashboard.
          </p>
        </div>
      ) : (
        <ol aria-labelledby={headingId} className="mt-5 space-y-1">
          {tracks.map((track) => {
            const artistLabel = track.artistNames.join(', ');
            const savedDate = formatSavedDate(track.savedAt);
            const spotifyUrl = isAllowedSpotifyTrackUrl(track.spotifyUrl) ? track.spotifyUrl : null;

            return (
              <li
                key={`${track.id}-${track.savedAt}`}
                className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-3 border-t border-border-subtle py-3 first:border-t-0 first:pt-0"
              >
                {isAllowedSpotifyImage(track.albumImageUrl) ? (
                  <Image
                    src={track.albumImageUrl}
                    alt={`Cover artwork for ${track.albumName}`}
                    width={44}
                    height={44}
                    className="size-11 rounded-control object-cover"
                  />
                ) : (
                  <span
                    role="img"
                    aria-label={`No cover artwork for ${track.albumName}`}
                    className="grid size-11 place-items-center rounded-control bg-surface-hover text-text-muted"
                  >
                    <Music2 aria-hidden="true" size={17} />
                  </span>
                )}

                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    {spotifyUrl ? (
                      <a
                        href={spotifyUrl}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${track.name} by ${artistLabel}, open on Spotify in a new tab`}
                        className="focus-ring min-w-0 flex-1 truncate rounded-sm text-body-sm font-semibold text-text-primary transition-colors duration-fast hover:text-accent-green"
                      >
                        {track.name}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-body-sm font-semibold text-text-primary">
                        {track.name}
                      </span>
                    )}
                    {spotifyUrl ? (
                      <ExternalLink
                        aria-hidden="true"
                        size={12}
                        className="shrink-0 text-text-muted"
                      />
                    ) : null}
                  </div>
                  <p className="mt-0.5 truncate text-caption text-text-secondary">{artistLabel}</p>
                  <time
                    dateTime={track.savedAt}
                    className="mt-1 block text-caption text-text-muted"
                  >
                    Saved {savedDate}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
