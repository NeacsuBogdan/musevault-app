import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
  getListeningInsights: vi.fn(),
  processListeningSyncChunk: vi.fn(),
  ListeningSyncError: class ListeningSyncError extends Error {
    retryAfter = null;
    constructor(public code: string) {
      super(code);
    }
  },
}));
vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession }));
vi.mock('@/lib/db/repositories/listening-intelligence', () => ({
  getListeningInsights: mocks.getListeningInsights,
}));
vi.mock('@/lib/spotify/listening-sync', () => ({
  ListeningSyncError: mocks.ListeningSyncError,
  processListeningSyncChunk: mocks.processListeningSyncChunk,
}));
import { GET, POST } from './route';

const session = {
  accessToken: 'hidden',
  refreshToken: 'hidden',
  accountId: 'account-1',
  displayName: 'Listener',
  imageUrl: null,
  expiresAt: 2_000_000_000_000,
  version: 1 as const,
};
function request(origin = 'http://127.0.0.1:3000') {
  return new NextRequest('http://127.0.0.1:3000/api/spotify/listening/sync', {
    method: 'POST',
    headers: { host: '127.0.0.1:3000', origin, 'sec-fetch-site': 'same-origin' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readSession.mockResolvedValue(session);
});
describe('listening sync route', () => {
  it('returns private authorization-required state without secrets', async () => {
    mocks.getListeningInsights.mockResolvedValue({ authorizationRequired: true });
    const response = await GET();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ authorizationRequired: true });
  });
  it('rejects cross-origin writes', async () => {
    expect((await POST(request('https://attacker.example'))).status).toBe(403);
    expect(mocks.processListeningSyncChunk).not.toHaveBeenCalled();
  });
  it('processes an authenticated same-origin bounded chunk', async () => {
    mocks.processListeningSyncChunk.mockResolvedValue({
      status: 'completed',
      result: 'no_changes',
      processedPlayCount: 0,
    });
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.processListeningSyncChunk).toHaveBeenCalledWith(session);
  });
  it('keeps the public Spotify-unavailable response unchanged', async () => {
    mocks.processListeningSyncChunk.mockRejectedValue(
      new mocks.ListeningSyncError('spotify_unavailable'),
    );
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: 'spotify_unavailable', retryAfter: null },
    });
  });
});
