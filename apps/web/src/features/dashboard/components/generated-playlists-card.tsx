import { Clock3, ListMusic } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

import { generatedPlaylists } from '../data/dashboard';
import { accentGradientClasses, accentSurfaceClasses } from './dashboard-accent';
import { DashboardIcon } from './dashboard-icon';

interface GeneratedPlaylistsCardProps {
  headingId: string;
}

export function GeneratedPlaylistsCard({ headingId }: GeneratedPlaylistsCardProps) {
  return (
    <Card id="generated-playlists" variant="elevated" padding="md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-[0.1em] text-accent-purple">
            Made from your taste
          </p>
          <h2 id={headingId} className="mt-1.5 text-card-title font-semibold text-text-primary">
            Generated for You
          </h2>
        </div>
        <Badge tone="purple">Weekly</Badge>
      </div>

      <ul aria-labelledby={headingId} className="mt-5 space-y-4">
        {generatedPlaylists.map((playlist) => (
          <li key={playlist.title} className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className={`grid size-12 shrink-0 place-items-center rounded-control bg-gradient-to-br ${accentGradientClasses[playlist.accent]} ${accentSurfaceClasses[playlist.accent]}`}
            >
              <DashboardIcon name={playlist.icon} size={19} strokeWidth={1.8} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-semibold text-text-primary">
                {playlist.title}
              </p>
              <p className="mt-0.5 truncate text-caption text-text-secondary">
                {playlist.description}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-muted">
                <span className="inline-flex items-center gap-1">
                  <ListMusic aria-hidden="true" size={12} />
                  {playlist.trackCount} tracks
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 aria-hidden="true" size={12} />
                  {playlist.duration}
                </span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
