import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { DashboardShell } from '@/features/dashboard';
import { readSession } from '@/lib/auth/session';
import { SavedTracksSessionRefreshRequired } from '@/lib/spotify/saved-tracks';
import { loadDashboardData } from '@/features/dashboard/data/dashboard-data';
import { createDashboardProfile } from '@/features/dashboard/data/dashboard-view-model';
import type { DashboardDataState } from '@/features/dashboard/types';

export const metadata: Metadata = {
  title: 'Dashboard',
  description:
    'View a secure overview of your Spotify saved tracks and MuseVault feature previews.',
};

export const dynamic = 'force-dynamic';

interface DashboardPageProps {
  searchParams: Promise<{
    retryAfter?: string | string[];
    spotifyError?: string | string[];
    spotifyRefresh?: string | string[];
  }>;
}

function singleSearchParameter(value: string | string[] | undefined): string | null {
  return typeof value === 'string' ? value : null;
}

function safeRetryAfter(value: string | null): number | null {
  if (!value || !/^\d+$/.test(value)) {
    return null;
  }

  const retryAfter = Number(value);

  return Number.isSafeInteger(retryAfter) && retryAfter > 0 && retryAfter <= 3_600
    ? retryAfter
    : null;
}

function dashboardErrorFromSearchParams(
  searchParams: Awaited<DashboardPageProps['searchParams']>,
): Exclude<DashboardDataState, { status: 'success' }> | null {
  const error = singleSearchParameter(searchParams.spotifyError);

  if (error === 'authorization_expired') {
    return { status: 'authorization_expired' };
  }

  if (error === 'rate_limited') {
    return {
      status: 'rate_limited',
      retryAfter: safeRetryAfter(singleSearchParameter(searchParams.retryAfter)),
    };
  }

  if (error === 'temporarily_unavailable') {
    return { status: 'temporarily_unavailable' };
  }

  if (error === 'unexpected_failure') {
    return { status: 'unexpected_failure' };
  }

  return null;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const [session, resolvedSearchParams] = await Promise.all([readSession(), searchParams]);

  if (!session) {
    redirect('/');
  }

  const profile = createDashboardProfile({
    displayName: session.displayName,
    imageUrl: session.imageUrl,
  });
  const requestedError = dashboardErrorFromSearchParams(resolvedSearchParams);

  if (requestedError) {
    return <DashboardShell profile={profile} state={requestedError} />;
  }

  const forcedRefreshCompleted =
    singleSearchParameter(resolvedSearchParams.spotifyRefresh) === 'forced';
  let state: DashboardDataState;

  try {
    state = await loadDashboardData(session, { forcedRefreshCompleted });
  } catch (error) {
    if (error instanceof SavedTracksSessionRefreshRequired) {
      redirect(`/api/auth/spotify/refresh${error.force ? '?force=1' : ''}`);
    }

    state = { status: 'unexpected_failure' };
  }

  return <DashboardShell profile={profile} state={state} />;
}
