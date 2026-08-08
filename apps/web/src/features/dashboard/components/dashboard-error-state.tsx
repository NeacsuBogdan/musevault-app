import { CircleAlert, RefreshCw } from 'lucide-react';

import { Card } from '@/components/ui/card';
import type { DashboardDataState } from '../types';

type DashboardErrorDataState = Exclude<DashboardDataState, { status: 'success' }>;

interface DashboardErrorStateProps {
  state: DashboardErrorDataState;
}

const actionClasses =
  'focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-transparent bg-accent-green px-4 text-body-sm font-semibold text-page shadow-card transition-colors duration-standard hover:bg-accent-green-strong';

export function DashboardErrorState({ state }: DashboardErrorStateProps) {
  const needsLibrary = state.status === 'sync_required' || state.status === 'sync_in_progress';
  const title =
    state.status === 'sync_required'
      ? 'Synchronize your library first'
      : state.status === 'sync_in_progress'
        ? 'Library synchronization is in progress'
        : 'The dashboard could not be loaded';
  const message =
    state.status === 'sync_required'
      ? 'MuseVault needs one completed full synchronization before it can show a persistent dashboard snapshot.'
      : state.status === 'sync_in_progress'
        ? 'An authoritative full synchronization is currently updating the library. Continue from Library, then return when it completes.'
        : 'MuseVault could not safely prepare your persisted library overview. No internal details or credentials were exposed.';

  return (
    <Card role="status" aria-labelledby="dashboard-error-title" variant="elevated" padding="lg">
      <CircleAlert aria-hidden="true" size={24} className="text-accent-yellow" />
      <h2
        id="dashboard-error-title"
        className="mt-4 text-section-title font-semibold text-text-primary"
      >
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-body-sm text-text-secondary">{message}</p>
      <a href={needsLibrary ? '/library' : '/dashboard'} className={`${actionClasses} mt-6`}>
        {needsLibrary ? null : <RefreshCw aria-hidden="true" size={16} />}
        {needsLibrary ? 'Open Library' : 'Reload dashboard'}
      </a>
    </Card>
  );
}
