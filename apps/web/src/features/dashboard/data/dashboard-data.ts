import 'server-only';

import type { SpotifySession } from '@/lib/auth/session';
import { getPersistedDashboardSnapshot } from '@/lib/db/repositories/persisted-library';

import type { DashboardDataState } from '../types';
import { createDashboardViewModel } from './dashboard-view-model';

export async function loadDashboardData(session: SpotifySession): Promise<DashboardDataState> {
  try {
    const result = await getPersistedDashboardSnapshot(session.accountId);
    if (result.status !== 'success') return result;

    return {
      status: 'success',
      viewModel: createDashboardViewModel(
        { displayName: session.displayName, imageUrl: session.imageUrl },
        result.snapshot,
      ),
    };
  } catch {
    return { status: 'unexpected_failure' };
  }
}
