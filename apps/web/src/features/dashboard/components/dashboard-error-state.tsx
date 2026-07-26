import { CircleAlert, RefreshCw, Unplug } from 'lucide-react';

import { Card } from '@/components/ui/card';

import type { DashboardDataState } from '../types';

type DashboardErrorDataState = Exclude<DashboardDataState, { status: 'success' }>;

interface DashboardErrorStateProps {
  state: DashboardErrorDataState;
}

const actionClasses =
  'focus-ring inline-flex min-h-11 items-center justify-center gap-2 rounded-control border border-transparent bg-accent-green px-4 text-body-sm font-semibold text-page shadow-card transition-colors duration-standard hover:bg-accent-green-strong';

export function DashboardErrorState({ state }: DashboardErrorStateProps) {
  const retryAfter =
    state.status === 'rate_limited' &&
    state.retryAfter !== null &&
    Number.isFinite(state.retryAfter) &&
    state.retryAfter > 0
      ? Math.ceil(state.retryAfter)
      : null;

  if (state.status === 'authorization_expired') {
    return (
      <Card role="alert" aria-labelledby="dashboard-error-title" variant="elevated" padding="lg">
        <Unplug aria-hidden="true" size={24} className="text-accent-yellow" />
        <h2
          id="dashboard-error-title"
          className="mt-4 text-section-title font-semibold text-text-primary"
        >
          Reconnect Spotify to continue
        </h2>
        <p className="mt-2 max-w-2xl text-body-sm text-text-secondary">
          Your Spotify authorization is no longer available. Reconnect to restore read-only access
          to your saved tracks.
        </p>
        <a href="/api/auth/spotify/login" className={`${actionClasses} mt-6`}>
          Reconnect Spotify
        </a>
      </Card>
    );
  }

  const title =
    state.status === 'rate_limited'
      ? 'Spotify needs a short pause'
      : state.status === 'temporarily_unavailable'
        ? 'Spotify is temporarily unavailable'
        : 'The dashboard could not be loaded';
  const message =
    state.status === 'rate_limited'
      ? retryAfter
        ? `Spotify has temporarily limited requests. Try reloading in about ${retryAfter} second${retryAfter === 1 ? '' : 's'}.`
        : 'Spotify has temporarily limited requests. Wait a moment, then reload the dashboard.'
      : state.status === 'temporarily_unavailable'
        ? 'Your connection is still preserved. Wait a moment, then try loading your library overview again.'
        : 'MuseVault could not safely prepare your library overview. No internal details or credentials were exposed.';

  return (
    <Card role="alert" aria-labelledby="dashboard-error-title" variant="elevated" padding="lg">
      <CircleAlert aria-hidden="true" size={24} className="text-accent-yellow" />
      <h2
        id="dashboard-error-title"
        className="mt-4 text-section-title font-semibold text-text-primary"
      >
        {title}
      </h2>
      <p className="mt-2 max-w-2xl text-body-sm text-text-secondary">{message}</p>
      <a href="/dashboard" className={`${actionClasses} mt-6`}>
        <RefreshCw aria-hidden="true" size={16} />
        Reload dashboard
      </a>
    </Card>
  );
}
