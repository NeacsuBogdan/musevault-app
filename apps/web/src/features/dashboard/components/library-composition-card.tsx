import { Card } from '@/components/ui/card';
import type { DashboardAnalyticsModel } from '../types';

function formatPercentage(value: number) {
  return `${Math.round(value)}%`;
}

export function LibraryCompositionCard({
  analytics,
}: {
  analytics: DashboardAnalyticsModel | null;
}) {
  return (
    <Card variant="elevated" padding="lg">
      <h3 className="text-card-title font-semibold text-text-primary">Library Composition</h3>
      <p className="mt-1 text-body-sm text-text-secondary">
        Current saved tracks by label and duration.
      </p>
      {!analytics ? (
        <p className="mt-8 text-body-sm text-text-muted">Composition unavailable.</p>
      ) : (
        <div className="mt-6 space-y-6">
          <div>
            <div className="flex justify-between text-body-sm">
              <span>Explicit · {analytics.explicitTrackCount}</span>
              <span>{formatPercentage(analytics.explicitPercentage)}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-hover">
              <div
                className="h-full bg-accent-purple"
                style={{ width: `${analytics.explicitPercentage}%` }}
              />
            </div>
            <p className="mt-2 text-caption text-text-muted">
              Non-explicit · {analytics.nonExplicitTrackCount} (
              {formatPercentage(analytics.nonExplicitPercentage)})
            </p>
          </div>
          <ul aria-label="Track duration distribution" className="space-y-3">
            {analytics.durationBuckets.map((bucket) => (
              <li key={bucket.key}>
                <div className="flex justify-between text-caption text-text-secondary">
                  <span>{bucket.label}</span>
                  <span>
                    {bucket.trackCount} · {formatPercentage(bucket.percentage)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-surface-hover">
                  <div
                    className="h-full bg-accent-blue"
                    style={{ width: `${bucket.percentage}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
