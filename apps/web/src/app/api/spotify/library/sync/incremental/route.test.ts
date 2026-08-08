import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getIncrementalSyncEligibility: vi.fn(),
  processIncrementalLibrarySync: vi.fn(),
  readSession: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession }));
vi.mock('@/lib/spotify/incremental-library-sync', () => ({
  getIncrementalSyncEligibility: mocks.getIncrementalSyncEligibility,
  processIncrementalLibrarySync: mocks.processIncrementalLibrarySync,
}));

import { GET, POST } from './route';

const session = {
  accessToken: 'secret',
  accountId: 'spotify-user',
  displayName: 'Listener',
  expiresAt: Date.now() + 60_000,
  imageUrl: null,
  refreshToken: 'secret',
  version: 1 as const,
};
const safeState = {
  available: true,
  reason: 'eligible',
  result: 'no_changes',
  lastSuccessfulSyncAt: '2026-08-08T10:00:00.000Z',
  lastFullSyncAt: '2026-08-08T09:00:00.000Z',
  successfulIncrementalSyncsSinceFull: 1,
  summary: { savedTrackCount: 10, totalDurationMs: 100, uniqueArtistCount: 2 },
};

function request(origin = 'http://127.0.0.1:3000') {
  return new NextRequest('http://127.0.0.1:3000/api/spotify/library/sync/incremental', {
    method: 'POST',
    headers: { host: '127.0.0.1:3000', origin, 'sec-fetch-site': 'same-origin' },
  });
}

beforeEach(() => {
  mocks.readSession.mockResolvedValue(session);
  mocks.getIncrementalSyncEligibility.mockResolvedValue(safeState);
  mocks.processIncrementalLibrarySync.mockResolvedValue(safeState);
});

describe('incremental sync API', () => {
  it('rejects unauthenticated requests', async () => {
    mocks.readSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect((await POST(request())).status).toBe(401);
  });

  it('rejects cross-site POST before doing work', async () => {
    expect((await POST(request('https://attacker.example'))).status).toBe(403);
    expect(mocks.processIncrementalLibrarySync).not.toHaveBeenCalled();
  });

  it('returns only safe no-store state', async () => {
    const response = await POST(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(body).toEqual(safeState);
    expect(JSON.stringify(body)).not.toContain(session.accessToken);
  });
});
