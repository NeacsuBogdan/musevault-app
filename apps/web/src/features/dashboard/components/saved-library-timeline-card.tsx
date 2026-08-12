import { ChartNoAxesCombined } from 'lucide-react';

import { Card } from '@/components/ui/card';
import type { DashboardAnalyticsModel } from '../types';

export function SavedLibraryTimelineCard({
  timeline,
}: {
  timeline: DashboardAnalyticsModel['savedTimeline'] | null;
}) {
  const maximum = Math.max(1, ...(timeline?.map((point) => point.savedTrackCount) ?? []));
  return (
    <Card id="saved-library-timeline" variant="elevated" padding="lg" className="min-w-0">
      <h3 className="text-card-title font-semibold text-text-primary">Saved Library Timeline</h3>
      <p className="mt-1 text-body-sm text-text-secondary">
        Tracks currently in your library, grouped by when they were saved.
      </p>
      {!timeline ? (
        <p className="mt-8 text-body-sm text-text-muted">Timeline unavailable.</p>
      ) : timeline.length === 0 ? (
        <div className="mt-7 rounded-card border border-dashed border-border-strong p-6 text-center">
          <ChartNoAxesCombined className="mx-auto text-text-muted" aria-hidden="true" size={20} />
          <p className="mt-3 text-body-sm font-semibold">No saved tracks to chart</p>
        </div>
      ) : (
        <ol aria-label="Current saved tracks by year" className="mt-7 flex h-52 items-end gap-3">
          {timeline.map((point) => (
            <li key={point.year} className="flex min-w-0 flex-1 flex-col items-center gap-2">
              <span className="text-caption font-semibold text-text-secondary">
                {point.savedTrackCount}
              </span>
              <span
                role="img"
                aria-label={`${point.year}: ${point.savedTrackCount} currently saved tracks; ${point.cumulativeTrackCount} cumulative`}
                className="min-h-1 w-full rounded-t-control bg-accent-green"
                style={{ height: `${Math.max(4, (point.savedTrackCount / maximum) * 144)}px` }}
              />
              <span className="truncate text-caption text-text-muted">{point.year}</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
