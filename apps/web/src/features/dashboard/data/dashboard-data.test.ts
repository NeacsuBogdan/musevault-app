import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SpotifySession } from '@/lib/auth/session';
import { loadDashboardData } from './dashboard-data';

const mocks = vi.hoisted(() => ({ getPersistedDashboardSnapshot: vi.fn() }));
vi.mock('@/lib/db/repositories/persisted-library', () => ({
  getPersistedDashboardSnapshot: mocks.getPersistedDashboardSnapshot,
}));

const session: SpotifySession = {
  accessToken: 'not-returned',
  accountId: 'account-123',
  displayName: 'Listener',
  expiresAt: 1_800_000_000_000,
  imageUrl: null,
  refreshToken: 'not-returned',
  version: 1,
};
const snapshot = {
  analytics: {
    topArtists: [],
    topAlbums: [],
    savedTimeline: [],
    explicitTrackCount: 0,
    nonExplicitTrackCount: 1284,
    durationBuckets: {
      under2Minutes: 0,
      twoTo3Minutes: 0,
      threeTo4Minutes: 1284,
      fourTo5Minutes: 0,
      fiveMinutesOrMore: 0,
    },
    firstSavedAt: null,
    latestSavedAt: null,
  },
  lastSuccessfulSyncAt: '2026-08-08T12:00:00.000Z',
  latestFullSyncAt: '2026-08-01T12:00:00.000Z',
  recentlySaved: [],
  savedTrackCount: 1284,
  totalDurationMs: 3600000,
  uniqueArtistCount: 412,
};

beforeEach(() => {
  mocks.getPersistedDashboardSnapshot.mockReset();
});

describe('database-backed dashboard loading', () => {
  it('resolves the persisted snapshot by authenticated Spotify account', async () => {
    mocks.getPersistedDashboardSnapshot.mockResolvedValue({ status: 'success', snapshot });
    const state = await loadDashboardData(session);
    expect(mocks.getPersistedDashboardSnapshot).toHaveBeenCalledWith('account-123');
    expect(state.status).toBe('success');
    if (state.status === 'success') expect(state.viewModel.savedTrackCount).toBe(1284);
  });

  it.each(['sync_required', 'sync_in_progress'] as const)('maps %s safely', async (status) => {
    mocks.getPersistedDashboardSnapshot.mockResolvedValue({ status });
    await expect(loadDashboardData(session)).resolves.toEqual({ status });
  });

  it('maps database failures without leaking raw details', async () => {
    mocks.getPersistedDashboardSnapshot.mockRejectedValue(new Error('sensitive database detail'));
    const state = await loadDashboardData(session);
    expect(state).toEqual({ status: 'unexpected_failure' });
    expect(JSON.stringify(state)).not.toContain('sensitive');
  });
});
