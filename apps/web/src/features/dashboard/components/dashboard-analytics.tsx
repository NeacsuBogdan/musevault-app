import { SectionHeader } from '@/components/ui/section-header';

import { MoodDistributionCard } from './mood-distribution-card';
import { MusicEvolutionCard } from './music-evolution-card';

export function DashboardAnalytics() {
  return (
    <section id="analytics" aria-labelledby="dashboard-analytics-title">
      <SectionHeader
        id="dashboard-analytics-title"
        eyebrow="Product preview"
        title="Future library analytics"
        description="These illustrations are not calculated from your Spotify data and require a full library sync."
        action={<span className="text-caption font-semibold text-text-muted">Coming later</span>}
      />
      <div className="mt-5 grid min-w-0 grid-cols-1 gap-dashboard min-[1360px]:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.8fr)]">
        <MusicEvolutionCard />
        <MoodDistributionCard />
      </div>
    </section>
  );
}
