import { LogOut, Plus, Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import type { DashboardDataState, DashboardProfile } from '../types';
import { DashboardProfileAvatar } from './dashboard-profile-avatar';

interface DashboardHeaderProps {
  dataStatus: DashboardDataState['status'];
  profile: DashboardProfile;
}

export function DashboardHeader({ dataStatus, profile }: DashboardHeaderProps) {
  const libraryAvailable = dataStatus === 'success';

  return (
    <header className="flex flex-col gap-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge tone={libraryAvailable ? 'green' : 'yellow'}>
              {libraryAvailable ? 'Saved snapshot' : 'Synchronization needed'}
            </Badge>
            <Badge tone="neutral">Read-only overview</Badge>
          </div>
          <h1 className="text-page-title font-semibold tracking-tight text-text-primary">
            Welcome back, {profile.firstName}
          </h1>
          <p className="mt-2 max-w-xl text-body text-text-secondary">
            Your latest synchronized library snapshot, with future MuseVault features clearly marked
            as previews.
          </p>
          <p className="mt-2 text-caption text-text-muted lg:hidden">
            Connected Spotify profile: {profile.displayName}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="lg:hidden">
            <DashboardProfileAvatar profile={profile} />
          </span>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            disabled
            aria-label="New Playlist, coming in a later milestone"
          >
            <Plus aria-hidden="true" size={16} />
            New Playlist · Later
          </Button>
          <form action="/api/auth/spotify/logout" method="post">
            <Button variant="ghost" size="sm" type="submit">
              <LogOut aria-hidden="true" size={16} />
              Logout
            </Button>
          </form>
        </div>
      </div>

      <div className="max-w-2xl">
        <div className="relative">
          <label htmlFor="dashboard-search" className="sr-only">
            Search your music library, coming in a later milestone
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
            placeholder="Search is coming in a later milestone"
            disabled
            aria-describedby="dashboard-search-help"
            className="h-11 w-full cursor-not-allowed rounded-control border border-border-subtle bg-surface pl-10 pr-4 text-body-sm text-text-muted shadow-card outline-none placeholder:text-text-muted disabled:opacity-70"
          />
        </div>
        <p id="dashboard-search-help" className="mt-2 text-caption text-text-muted">
          Search is planned for a later milestone.
        </p>
      </div>
    </header>
  );
}
