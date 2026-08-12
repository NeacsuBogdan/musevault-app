import { CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { DashboardAnalyticsModel } from '../types';

const formatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});
function formatDate(value: string | null) {
  if (!value) return 'No saved tracks';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unavailable' : formatter.format(date);
}

export function LibraryFactsCard({
  analytics,
  headingId,
}: {
  analytics: DashboardAnalyticsModel | null;
  headingId: string;
}) {
  return (
    <Card variant="elevated" padding="md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-[0.1em] text-accent-green">
            Current snapshot
          </p>
          <h2 id={headingId} className="mt-1.5 text-card-title font-semibold">
            Library Facts
          </h2>
        </div>
        <Badge tone={analytics ? 'green' : 'yellow'}>
          {analytics ? 'Synced data' : 'Unavailable'}
        </Badge>
      </div>
      {analytics ? (
        <dl className="mt-5 space-y-4">
          <div>
            <dt className="text-caption text-text-muted">Earliest save in current library</dt>
            <dd className="mt-1 text-body-sm font-semibold">
              {formatDate(analytics.firstSavedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-muted">Latest save in current library</dt>
            <dd className="mt-1 text-body-sm font-semibold">
              {formatDate(analytics.latestSavedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-muted">Explicit tracks</dt>
            <dd className="mt-1 text-body-sm font-semibold">
              {analytics.explicitTrackCount} · {Math.round(analytics.explicitPercentage)}%
            </dd>
          </div>
        </dl>
      ) : (
        <div className="mt-5 text-center">
          <CalendarDays className="mx-auto text-text-muted" aria-hidden="true" size={20} />
          <p className="mt-3 text-body-sm">Library facts unavailable.</p>
        </div>
      )}
    </Card>
  );
}
