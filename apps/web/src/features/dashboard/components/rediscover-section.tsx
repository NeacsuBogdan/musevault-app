import { Card } from '@/components/ui/card';
import { SectionHeader } from '@/components/ui/section-header';
import { DashboardIcon } from './dashboard-icon';

export function RediscoverSection() {
  return (
    <section id="rediscover" aria-labelledby="rediscover-title">
      <SectionHeader
        id="rediscover-title"
        eyebrow="From your saved library"
        title="Rediscover"
        description="Older saved tracks ranked from persisted library, recorded listening, and Spotify affinity data."
      />
      <Card className="mt-5 flex flex-col gap-5 bg-gradient-to-br from-accent-green/10 to-transparent sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-green/10 text-accent-green">
            <DashboardIcon name="gem" size={18} strokeWidth={1.9} />
          </span>
          <div>
            <h3 className="text-card-title font-semibold text-text-primary">Find an older save</h3>
            <p className="mt-1 text-body-sm text-text-secondary">
              Results use only signals MuseVault can actually observe and never assume missing
              listening history means inactivity.
            </p>
          </div>
        </div>
        <a
          href="/rediscover"
          className="focus-ring inline-flex min-h-10 shrink-0 items-center justify-center rounded-control bg-accent-green px-4 text-body-sm font-semibold text-page transition-colors hover:bg-accent-green-strong"
        >
          Open Rediscover
        </a>
      </Card>
    </section>
  );
}
