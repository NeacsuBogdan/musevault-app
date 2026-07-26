import type { DashboardRecentTrack } from '../types';
import { LibraryHealthCard } from './library-health-card';
import { RecentlySavedCard } from './recently-saved-card';

interface DashboardUtilityColumnProps {
  className?: string;
  recentlySaved: readonly DashboardRecentTrack[] | null;
}

export function DashboardUtilityColumn({ className, recentlySaved }: DashboardUtilityColumnProps) {
  return (
    <div className={className}>
      <RecentlySavedCard headingId="recently-saved-title" tracks={recentlySaved} />
      <LibraryHealthCard headingId="library-health-title" />
    </div>
  );
}
