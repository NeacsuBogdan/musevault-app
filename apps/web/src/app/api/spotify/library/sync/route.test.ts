import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFullLibrarySyncStatus: vi.fn(),
  processFullLibrarySyncChunk: vi.fn(),
  readSession: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession }));
vi.mock('@/lib/spotify/library-sync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/spotify/library-sync')>();
  return {
    ...actual,
    getFullLibrarySyncStatus: mocks.getFullLibrarySyncStatus,
    processFullLibrarySyncChunk: mocks.processFullLibrarySyncChunk,
  };
});

import { GET, POST } from './route';

const session = {
  accessToken: 'not-returned',
  accountId: 'spotify-user',
  displayName: 'Listener',
  expiresAt: Date.now() + 60_000,
  imageUrl: null,
  refreshToken: 'not-returned',
  version: 1 as const,
};
const state = {
  failureCode: null,
  lastSuccessfulSyncAt: null,
  processedTrackCount: 150,
  spotifyTotal: 500,
  status: 'running' as const,
  summary: { savedTrackCount: 0, totalDurationMs: 0, uniqueArtistCount: 0 },
};

function postRequest(origin = 'http://127.0.0.1:3000') {
  return new NextRequest('http://127.0.0.1:3000/api/spotify/library/sync', {
    method: 'POST',
    headers: { host: '127.0.0.1:3000', origin, 'sec-fetch-site': 'same-origin' },
  });
}

beforeEach(() => {
  mocks.readSession.mockResolvedValue(session);
  mocks.getFullLibrarySyncStatus.mockResolvedValue(state);
  mocks.processFullLibrarySyncChunk.mockResolvedValue(state);
});

describe('full library sync API', () => {
  it('rejects unauthenticated GET and POST requests without doing work', async () => {
    mocks.readSession.mockResolvedValue(null);
    const getResponse = await GET();
    const postResponse = await POST(postRequest());

    expect(getResponse.status).toBe(401);
    expect(postResponse.status).toBe(401);
    expect(mocks.processFullLibrarySyncChunk).not.toHaveBeenCalled();
  });

  it('returns only safe progress with no-store caching', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(body).toEqual(state);
    expect(JSON.stringify(body)).not.toContain(session.accessToken);
    expect(JSON.stringify(body)).not.toContain(session.refreshToken);
  });

  it('rejects cross-origin POST requests', async () => {
    const response = await POST(postRequest('https://attacker.example'));

    expect(response.status).toBe(403);
    expect(mocks.processFullLibrarySyncChunk).not.toHaveBeenCalled();
  });

  it('processes one bounded service step and returns progress', async () => {
    const response = await POST(postRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(state);
    expect(mocks.processFullLibrarySyncChunk).toHaveBeenCalledOnce();
    expect(mocks.processFullLibrarySyncChunk).toHaveBeenCalledWith(session);
  });
});
