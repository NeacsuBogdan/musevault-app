import { ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

interface LibraryHealthCardProps {
  headingId: string;
}

export function LibraryHealthCard({ headingId }: LibraryHealthCardProps) {
  return (
    <Card id="library-health" variant="elevated" padding="md">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-caption font-semibold uppercase tracking-[0.1em] text-accent-green">
            Product preview
          </p>
          <h2 id={headingId} className="mt-1.5 text-card-title font-semibold text-text-primary">
            Library Health
          </h2>
        </div>
        <Badge tone="neutral">Preview</Badge>
      </div>

      <div className="mt-5 rounded-card border border-dashed border-border-strong bg-surface p-5 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-accent-green/10 text-accent-green">
          <ShieldCheck aria-hidden="true" size={22} />
        </span>
        <p className="mt-4 text-body-sm font-semibold text-text-primary">
          No health score is calculated yet
        </p>
        <p className="mt-2 text-caption leading-5 text-text-secondary">
          Accurate collection-quality signals require a persistent, full-library sync.
        </p>
      </div>

      <p className="mt-4 text-caption font-semibold text-text-muted">Coming in a later milestone</p>
    </Card>
  );
}
