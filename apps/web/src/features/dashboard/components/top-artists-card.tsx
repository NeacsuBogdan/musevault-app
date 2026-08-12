import { Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { DashboardAnalyticsModel } from '../types';

export function TopArtistsCard({
  artists,
}: {
  artists: DashboardAnalyticsModel['topArtists'] | null;
}) {
  return (
    <Card variant="elevated" padding="lg">
      <h3 className="text-card-title font-semibold text-text-primary">
        Top artists by saved tracks
      </h3>
      <p className="mt-1 text-body-sm text-text-secondary">
        Artists credited across your current saved library.
      </p>
      {!artists ? (
        <p className="mt-8 text-body-sm text-text-muted">Artists unavailable.</p>
      ) : artists.length === 0 ? (
        <div className="mt-7 text-center">
          <Users className="mx-auto text-text-muted" aria-hidden="true" size={20} />
          <p className="mt-3 text-body-sm font-semibold">No artists yet</p>
        </div>
      ) : (
        <ol className="mt-5 divide-y divide-border-subtle">
          {artists.map((artist, index) => (
            <li key={artist.id} className="flex items-center gap-3 py-3">
              <span className="text-caption text-text-muted">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-body-sm font-semibold">
                {artist.name}
              </span>
              <span className="text-caption text-text-secondary">
                {artist.savedTrackCount} tracks
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
