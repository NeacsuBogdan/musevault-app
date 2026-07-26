import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';

import { rediscoverPreviews } from '../data/dashboard';
import { accentGradientClasses, accentSurfaceClasses } from './dashboard-accent';
import { DashboardIcon } from './dashboard-icon';

export function RediscoverSection() {
  return (
    <section id="rediscover" aria-labelledby="rediscover-title">
      <SectionHeader
        id="rediscover-title"
        eyebrow="Product preview"
        title="Rediscover your library"
        description="Recommendation concepts for a later milestone. These cards are not generated from your Spotify data."
        action={<Badge tone="neutral">Requires full library sync</Badge>}
      />

      <div className="mt-5 grid grid-cols-1 gap-dashboard sm:grid-cols-2">
        {rediscoverPreviews.map((collection) => (
          <article key={collection.title}>
            <Card
              className={`h-full bg-gradient-to-br ${accentGradientClasses[collection.accent]}`}
              padding="md"
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className={`grid size-10 place-items-center rounded-control ${accentSurfaceClasses[collection.accent]}`}
                >
                  <DashboardIcon name={collection.icon} size={18} strokeWidth={1.9} />
                </span>
                <Badge tone="neutral">Preview</Badge>
              </div>
              <h3 className="mt-7 text-card-title font-semibold text-text-primary">
                {collection.title}
              </h3>
              <p className="mt-2 text-body-sm text-text-secondary">{collection.description}</p>
              <p className="mt-4 text-caption font-semibold text-text-muted">Coming later</p>
            </Card>
          </article>
        ))}
      </div>
    </section>
  );
}
