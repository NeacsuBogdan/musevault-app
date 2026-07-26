import { SectionHeader } from '@/components/ui/section-header';

import { MoodDistributionCard } from './mood-distribution-card';
import { MusicEvolutionCard } from './music-evolution-card';

export function DashboardAnalytics() {
  return (
    <section id="analytics" aria-labelledby="dashboard-analytics-title">
      <SectionHeader
        id="dashboard-analytics-title"
        eyebrow="Listening analytics"
        title="Your listening at a glance"
        description="A static preview of the signals MuseVault can surface from your library."
      />
      <div className="mt-5 grid min-w-0 grid-cols-1 gap-dashboard min-[1360px]:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.8fr)]">
        <MusicEvolutionCard />
        <MoodDistributionCard />
      </div>
    </section>
  );
}
