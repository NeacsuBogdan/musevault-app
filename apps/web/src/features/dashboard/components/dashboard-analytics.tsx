import { SectionHeader } from '@/components/ui/section-header';

import type { DashboardAnalyticsModel } from '../types';
import { LibraryCompositionCard } from './library-composition-card';
import { SavedLibraryTimelineCard } from './saved-library-timeline-card';
import { TopAlbumsCard } from './top-albums-card';
import { TopArtistsCard } from './top-artists-card';

export function DashboardAnalytics({ analytics }: { analytics: DashboardAnalyticsModel | null }) {
  return (
    <section id="analytics" aria-labelledby="dashboard-analytics-title">
      <SectionHeader
        id="dashboard-analytics-title"
        eyebrow="Synced library"
        title="Library analytics"
        description="Calculated from your latest synchronized library snapshot."
        action={<span className="text-caption font-semibold text-text-muted">Snapshot data</span>}
      />
      <div className="mt-5 grid min-w-0 grid-cols-1 gap-dashboard min-[1360px]:grid-cols-2">
        <SavedLibraryTimelineCard timeline={analytics?.savedTimeline ?? null} />
        <LibraryCompositionCard analytics={analytics} />
        <TopArtistsCard artists={analytics?.topArtists ?? null} />
        <TopAlbumsCard albums={analytics?.topAlbums ?? null} />
      </div>
    </section>
  );
}
