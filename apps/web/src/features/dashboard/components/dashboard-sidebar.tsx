import { CheckCircle2 } from 'lucide-react';

import { Card } from '@/components/ui/card';

import { dashboardProfile, desktopNavigation, librarySyncStatus } from '../data/dashboard';
import { DashboardIcon } from './dashboard-icon';

export function DashboardSidebar() {
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
              <a
                href={item.href}
                aria-current={item.isActive ? 'page' : undefined}
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
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto space-y-3 pt-5">
        <Card padding="sm" className="bg-surface-elevated">
          <div className="flex gap-3">
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-control bg-accent-green/10 text-accent-green">
              <CheckCircle2 aria-hidden="true" size={16} />
            </span>
            <div className="min-w-0">
              <p className="text-body-sm font-semibold text-text-primary">
                {librarySyncStatus.label}
              </p>
              <p className="mt-0.5 text-caption text-text-secondary">{librarySyncStatus.detail}</p>
              <p className="mt-2 text-caption text-text-muted">{librarySyncStatus.lastSynced}</p>
            </div>
          </div>
        </Card>

        <Card padding="sm" className="bg-surface">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-purple/15 text-caption font-semibold text-accent-purple"
            >
              {dashboardProfile.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-text-primary">
                {dashboardProfile.displayName}
              </p>
              <p className="truncate text-caption text-text-muted">{dashboardProfile.handle}</p>
            </div>
          </div>
        </Card>
      </div>
    </aside>
  );
}
