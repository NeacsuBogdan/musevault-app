import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

import type { DashboardStatistic } from '../types';
import { accentSurfaceClasses } from './dashboard-accent';
import { DashboardIcon } from './dashboard-icon';

interface DashboardStatisticsProps {
  statistics: readonly DashboardStatistic[];
}

export function DashboardStatistics({ statistics }: DashboardStatisticsProps) {
  return (
    <section aria-labelledby="dashboard-statistics-title">
      <h2 id="dashboard-statistics-title" className="sr-only">
        Saved-library statistics
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statistics.map((statistic) => (
          <article key={statistic.label}>
            <Card className="h-full" padding="md">
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`grid size-9 place-items-center rounded-control ${accentSurfaceClasses[statistic.accent]}`}
                >
                  <DashboardIcon name={statistic.icon} size={17} strokeWidth={2} />
                </span>
                <Badge tone="neutral">Synced library</Badge>
              </div>
              <h3 className="mt-5 text-caption font-medium text-text-secondary">
                {statistic.label}
              </h3>
              <p className="mt-1 text-section-title font-semibold tracking-tight text-text-primary">
                {statistic.value}
              </p>
              <p className="mt-2 text-caption leading-5 text-text-muted">{statistic.helper}</p>
            </Card>
          </article>
        ))}
      </div>
    </section>
  );
}
