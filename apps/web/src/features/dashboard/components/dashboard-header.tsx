import { Bell, Plus, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';

import { dashboardProfile } from '../data/dashboard';

export function DashboardHeader() {
  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone="green">Overview</Badge>
            <Badge tone="neutral">Static preview</Badge>
          </div>
          <h1 className="text-page-title font-semibold tracking-tight text-text-primary">
            Good evening, {dashboardProfile.firstName}
          </h1>
          <p className="mt-2 max-w-xl text-body text-text-secondary">
            Your library has a story. Here is what your listening says today.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <IconButton aria-label="View notifications" variant="secondary" size="md" type="button">
            <Bell aria-hidden="true" size={18} />
          </IconButton>
          <Button variant="primary" size="md" type="button">
            <Plus aria-hidden="true" size={17} />
            New Playlist
          </Button>
        </div>
      </div>

      <div role="search" aria-label="Search your music library" className="relative max-w-2xl">
        <label htmlFor="dashboard-search" className="sr-only">
          Search your music library
        </label>
        <Search
          aria-hidden="true"
          size={17}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <input
          id="dashboard-search"
          type="search"
          name="query"
          placeholder="Search songs, artists, or playlists"
          className="focus-ring h-11 w-full rounded-control border border-border-subtle bg-surface pl-10 pr-4 text-body-sm text-text-primary shadow-card outline-none transition-[border-color,background-color] duration-standard ease-standard placeholder:text-text-muted hover:border-border-strong focus:border-accent-green/60"
        />
      </div>
    </header>
  );
}
