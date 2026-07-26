import { CheckCircle2, CircleAlert } from 'lucide-react';

import { Card } from '@/components/ui/card';

import type { DashboardDataState, DashboardProfile } from '../types';
import { desktopNavigation } from '../data/dashboard';
import { DashboardIcon } from './dashboard-icon';
import { DashboardProfileAvatar } from './dashboard-profile-avatar';

interface DashboardSidebarProps {
  dataStatus: DashboardDataState['status'];
  loadedTrackCount: number | null;
  profile: DashboardProfile;
}

export function DashboardSidebar({ dataStatus, loadedTrackCount, profile }: DashboardSidebarProps) {
  const libraryAvailable = loadedTrackCount !== null;
  const authorizationExpired = dataStatus === 'authorization_expired';
  const StatusIcon = libraryAvailable ? CheckCircle2 : CircleAlert;

  return (
    <aside
      aria-label="Dashboard sidebar"
      className="sticky top-0 hidden h-dvh min-h-0 flex-col border-r border-border-subtle bg-sidebar px-4 py-5 lg:flex"
    >
      <a
        href="/dashboard"
        className="focus-ring mx-2 flex items-center gap-3 rounded-control"
        aria-label="MuseVault dashboard"
      >
        <span className="grid size-9 place-items-center rounded-control bg-accent-green text-page shadow-card">
          <DashboardIcon name="music" size={18} strokeWidth={2.4} />
        </span>
        <span className="text-card-title font-semibold tracking-tight text-text-primary">
          MuseVault
        </span>
      </a>

      <nav aria-label="Primary" className="mt-9">
        <p className="px-3 text-caption font-semibold uppercase tracking-[0.12em] text-text-muted">
          Your vault
        </p>
        <ul className="mt-3 space-y-1">
          {desktopNavigation.map((item) => (
            <li key={item.label}>
              {item.href ? (
                <a
                  href={item.href}
                  aria-current={item.isActive ? 'page' : undefined}
                  aria-label={item.status ? `${item.label} (${item.status})` : undefined}
                  className={
                    item.isActive
                      ? 'focus-ring relative flex min-h-10 items-center gap-3 rounded-control bg-accent-green/10 px-3 text-body-sm font-medium text-accent-green'
                      : 'focus-ring flex min-h-10 items-center gap-3 rounded-control px-3 text-body-sm font-medium text-text-secondary transition-colors duration-fast ease-standard hover:bg-surface-hover hover:text-text-primary'
                  }
                >
                  {item.isActive ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2 left-0 w-0.5 rounded-pill bg-accent-green"
                    />
                  ) : null}
                  <DashboardIcon name={item.icon} size={17} strokeWidth={1.9} />
                  <span>{item.label}</span>
                  {item.status ? (
                    <span className="ml-auto text-[0.625rem] font-semibold uppercase tracking-wide text-text-muted">
                      {item.status}
                    </span>
                  ) : null}
                </a>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex min-h-10 cursor-not-allowed items-center gap-3 rounded-control px-3 text-body-sm font-medium text-text-muted opacity-65"
                >
                  <DashboardIcon name={item.icon} size={17} strokeWidth={1.9} />
                  <span>{item.label}</span>
                  <span className="ml-auto text-[0.625rem] font-semibold uppercase tracking-wide">
                    {item.status ?? 'Later'}
                  </span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto space-y-3 pt-5">
        <Card padding="sm" className="bg-surface-elevated">
          <div className="flex gap-3">
            <span
              className={
                libraryAvailable
                  ? 'mt-0.5 grid size-8 shrink-0 place-items-center rounded-control bg-accent-green/10 text-accent-green'
                  : 'mt-0.5 grid size-8 shrink-0 place-items-center rounded-control bg-accent-yellow/10 text-accent-yellow'
              }
            >
              <StatusIcon aria-hidden="true" size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-text-primary">
                {authorizationExpired ? 'Reconnect required' : 'Spotify session active'}
              </p>
              <p className="mt-0.5 text-caption text-text-secondary">
                {libraryAvailable
                  ? `${loadedTrackCount} recent track${loadedTrackCount === 1 ? '' : 's'} loaded`
                  : authorizationExpired
                    ? 'Authorization has expired'
                    : 'Library overview unavailable'}
              </p>
              <p className="mt-2 text-caption text-text-muted">
                {libraryAvailable
                  ? 'Latest page only · no persistent sync'
                  : 'No library data was loaded'}
              </p>
            </div>
          </div>
        </Card>

        <Card padding="sm" className="bg-surface">
          <div className="flex min-w-0 items-center gap-3">
            <DashboardProfileAvatar profile={profile} />
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-text-primary">
                {profile.displayName}
              </p>
              <p className="truncate text-caption text-text-muted">Spotify profile</p>
            </div>
          </div>
        </Card>
      </div>
    </aside>
  );
}
