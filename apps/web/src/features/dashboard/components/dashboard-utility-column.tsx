import type { DashboardAnalyticsModel, DashboardRecentTrack } from '../types';
import { LibraryFactsCard } from './library-facts-card';
import { RecentlySavedCard } from './recently-saved-card';

interface DashboardUtilityColumnProps {
  className?: string;
  recentlySaved: readonly DashboardRecentTrack[] | null;
  analytics: DashboardAnalyticsModel | null;
}

export function DashboardUtilityColumn({
  analytics,
  className,
  recentlySaved,
}: DashboardUtilityColumnProps) {
  return (
    <div className={className}>
      <RecentlySavedCard headingId="recently-saved-title" tracks={recentlySaved} />
      <LibraryFactsCard analytics={analytics} headingId="library-facts-title" />
    </div>
  );
}
