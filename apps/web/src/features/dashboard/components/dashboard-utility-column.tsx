import { GeneratedPlaylistsCard } from './generated-playlists-card';
import { LibraryHealthCard } from './library-health-card';

interface DashboardUtilityColumnProps {
  className?: string;
}

export function DashboardUtilityColumn({ className }: DashboardUtilityColumnProps) {
  return (
    <div className={className}>
      <GeneratedPlaylistsCard headingId="generated-playlists-title" />
      <LibraryHealthCard headingId="library-health-title" />
    </div>
  );
}
