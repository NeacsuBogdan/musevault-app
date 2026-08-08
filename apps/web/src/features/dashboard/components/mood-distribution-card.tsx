import { Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export function MoodDistributionCard() {
  return (
    <Card variant="elevated" padding="lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-card-title font-semibold text-text-primary">Mood Distribution</h3>
          <p className="mt-1 text-body-sm text-text-secondary">
            A future view of the character of your library
          </p>
        </div>
        <Badge tone="neutral">Preview</Badge>
      </div>

      <figure className="mt-7">
        <div className="relative mx-auto grid size-44 place-items-center">
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 120 120"
            className="absolute inset-0 size-full -rotate-90 opacity-55"
          >
            <circle
              cx="60"
              cy="60"
              r="45"
              fill="none"
              className="stroke-border-strong"
              strokeWidth="16"
              strokeDasharray="3 5"
            />
            <circle
              cx="60"
              cy="60"
              r="45"
              pathLength="100"
              fill="none"
              className="stroke-accent-purple"
              strokeWidth="16"
              strokeDasharray="18 82"
              strokeLinecap="round"
            />
            <circle
              cx="60"
              cy="60"
              r="45"
              pathLength="100"
              fill="none"
              className="stroke-accent-green"
              strokeWidth="16"
              strokeDasharray="12 88"
              strokeDashoffset="-34"
              strokeLinecap="round"
            />
          </svg>
          <div className="relative text-center">
            <Sparkles aria-hidden="true" size={20} className="mx-auto text-accent-purple" />
            <p className="mt-2 text-body-sm font-semibold text-text-primary">Requires analysis</p>
          </div>
        </div>

        <figcaption className="mt-6 border-t border-border-subtle pt-4 text-body-sm text-text-secondary">
          No mood values are calculated yet. Mood analysis will be implemented in a later milestone.
        </figcaption>
      </figure>
    </Card>
  );
}
