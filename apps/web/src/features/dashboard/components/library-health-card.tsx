import { CheckCircle2, CircleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';

import { libraryHealth } from '../data/dashboard';

interface LibraryHealthCardProps {
  headingId: string;
}

export function LibraryHealthCard({ headingId }: LibraryHealthCardProps) {
  return (
    <Card id="library-health" variant="elevated" padding="md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-[0.1em] text-accent-green">
            Collection quality
          </p>
          <h2 id={headingId} className="mt-1.5 text-card-title font-semibold text-text-primary">
            Library Health
          </h2>
        </div>
        <Badge tone="green">Strong</Badge>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <ProgressRing value={libraryHealth.score} size={92} label="Library health score" />
        <p className="text-body-sm text-text-secondary">{libraryHealth.summary}</p>
      </div>

      <ul aria-labelledby={headingId} className="mt-5 space-y-3">
        {libraryHealth.metrics.map((metric) => {
          const needsAttention = metric.status === 'attention';
          const StatusIcon = needsAttention ? CircleAlert : CheckCircle2;

          return (
            <li
              key={metric.label}
              className="flex items-center justify-between gap-3 border-t border-border-subtle pt-3 text-body-sm"
            >
              <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                <StatusIcon
                  aria-hidden="true"
                  size={15}
                  className={
                    needsAttention ? 'shrink-0 text-accent-yellow' : 'shrink-0 text-accent-green'
                  }
                />
                <span>{metric.label}</span>
              </span>
              <span
                className={
                  needsAttention
                    ? 'shrink-0 font-medium text-accent-yellow'
                    : 'shrink-0 font-medium text-text-primary'
                }
              >
                {metric.value}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
