import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const mocks = vi.hoisted(() => ({
  loadDashboardData: vi.fn(),
  readSession: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession }));
vi.mock('@/features/dashboard/data/dashboard-data', () => ({
  loadDashboardData: mocks.loadDashboardData,
}));
vi.mock('@/features/dashboard', () => ({ DashboardShell: () => null }));

import DashboardPage from './page';

const session = {
  accessToken: 'not-returned',
  accountId: 'account-1',
  displayName: 'Listener',
  expiresAt: 1_800_000_000_000,
  imageUrl: null,
  refreshToken: 'not-returned',
  version: 1 as const,
};

beforeEach(() => {
  mocks.loadDashboardData.mockReset();
  mocks.readSession.mockReset();
  mocks.redirect.mockReset();
  mocks.redirect.mockImplementation(() => {
    throw new Error('redirect');
  });
});

describe('dashboard page', () => {
  it('redirects unauthenticated visitors without loading dashboard data', async () => {
    mocks.readSession.mockResolvedValue(null);
    await expect(DashboardPage()).rejects.toThrow('redirect');
    expect(mocks.redirect).toHaveBeenCalledWith('/');
    expect(mocks.loadDashboardData).not.toHaveBeenCalled();
  });

  it('loads authenticated dashboard data directly from the database-backed loader', async () => {
    mocks.readSession.mockResolvedValue(session);
    mocks.loadDashboardData.mockResolvedValue({ status: 'sync_required' });
    const element = await DashboardPage();
    expect(mocks.loadDashboardData).toHaveBeenCalledWith(session);
    expect((element as ReactElement<{ state: unknown }>).props.state).toEqual({
      status: 'sync_required',
    });
  });
});
