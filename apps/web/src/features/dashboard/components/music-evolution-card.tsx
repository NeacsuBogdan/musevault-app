import { ChartNoAxesCombined } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

export function MusicEvolutionCard() {
  return (
    <Card id="evolution" variant="elevated" padding="lg" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-card-title font-semibold text-text-primary">Music Evolution</h3>
          <p className="mt-1 text-body-sm text-text-secondary">
            A future view of how your library changes over time
          </p>
        </div>
        <Badge tone="neutral">Preview</Badge>
      </div>

      <figure className="mt-7 min-w-0">
        <div className="relative overflow-hidden rounded-card border border-dashed border-border-strong bg-surface p-4">
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 640 196"
            className="h-auto w-full opacity-55"
          >
            {[28, 70, 112, 154].map((position) => (
              <line
                key={position}
                x1="12"
                x2="628"
                y1={position}
                y2={position}
                className="stroke-border-subtle"
                strokeWidth="1"
                strokeDasharray="4 7"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <path
              d="M 12 142 C 96 126, 142 151, 224 109 S 365 84, 438 99 S 552 45, 628 61"
              className="stroke-accent-green"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M 12 158 C 101 153, 155 98, 235 119 S 366 137, 454 88 S 564 105, 628 72"
              className="stroke-accent-purple"
              fill="none"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="inline-flex items-center gap-2 rounded-pill border border-border-strong bg-surface-elevated/95 px-3 py-2 text-caption font-semibold text-text-primary shadow-card">
              <ChartNoAxesCombined aria-hidden="true" size={15} className="text-accent-green" />
              Requires full library sync
            </span>
          </div>
        </div>

        <figcaption className="mt-4 text-body-sm text-text-secondary">
          This illustration is not calculated from your Spotify data. Historical analytics will
          arrive in a later milestone.
        </figcaption>
      </figure>
    </Card>
  );
}
