import 'server-only';

import type { SpotifySession } from '@/lib/auth/session';
import { parseRetryAfterSeconds, SpotifyApiError } from '@/lib/spotify/errors';
import {
  loadSpotifySavedTracksPage,
  SAVED_TRACKS_PAGE_MAX_LIMIT,
  SavedTracksSessionRefreshRequired,
} from '@/lib/spotify/saved-tracks';
import { SpotifyTokenRefreshError } from '@/lib/spotify/tokens';

import type { DashboardDataState } from '../types';
import { createDashboardViewModel } from './dashboard-view-model';

interface LoadDashboardDataOptions {
  forcedRefreshCompleted?: boolean;
}

export function dashboardErrorStateFrom(
  error: unknown,
): Exclude<DashboardDataState, { status: 'success' }> {
  if (error instanceof SpotifyTokenRefreshError) {
    if (error.kind === 'permanent') {
      return { status: 'authorization_expired' };
    }

    if (error.status === 429) {
      return {
        status: 'rate_limited',
        retryAfter: parseRetryAfterSeconds(error.retryAfter),
      };
    }

    return { status: 'temporarily_unavailable' };
  }

  if (error instanceof SpotifyApiError) {
    if (error.kind === 'unauthorized' || error.kind === 'forbidden') {
      return { status: 'authorization_expired' };
    }

    if (error.kind === 'rate_limited') {
      return {
        status: 'rate_limited',
        retryAfter: error.retryAfter,
      };
    }

    return { status: 'temporarily_unavailable' };
  }

  return { status: 'unexpected_failure' };
}

export async function loadDashboardData(
  session: SpotifySession,
  options: LoadDashboardDataOptions = {},
): Promise<DashboardDataState> {
  try {
    const page = await loadSpotifySavedTracksPage(
      session,
      {
        limit: SAVED_TRACKS_PAGE_MAX_LIMIT,
        offset: 0,
      },
      {
        forcedRefreshCompleted: options.forcedRefreshCompleted,
        refreshMode: 'signal',
      },
    );

    return {
      status: 'success',
      viewModel: createDashboardViewModel(
        {
          displayName: session.displayName,
          imageUrl: session.imageUrl,
        },
        page,
      ),
    };
  } catch (error) {
    if (error instanceof SavedTracksSessionRefreshRequired) {
      throw error;
    }

    return dashboardErrorStateFrom(error);
  }
}
