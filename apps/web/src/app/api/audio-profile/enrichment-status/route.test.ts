import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
  resolve: vi.fn(),
  status: vi.fn(),
}));

vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession }));
vi.mock('@/lib/db/repositories/audio-profile', () => ({
  resolveAudioProfileUser: mocks.resolve,
  getAudioEnrichmentStatus: mocks.status,
}));

import { GET } from './route';

const persistedStatus = {
  currentSavedTrackCount: 3_009,
  audioCoveredTrackCount: 67,
  audioCoveragePercent: 2.2,
  coverageQuality: 'LOW',
  currentlyEligibleRemainingCount: 2_900,
  coolingDownCount: 42,
};

beforeEach(() => {
  mocks.readSession.mockResolvedValue({ accountId: 'account-id' });
  mocks.resolve.mockResolvedValue('user-id');
  mocks.status.mockResolvedValue(persistedStatus);
});

describe('audio enrichment status route', () => {
  it('returns only the authenticated user persisted status with private no-store caching', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual(persistedStatus);
    expect(mocks.resolve).toHaveBeenCalledExactlyOnceWith('account-id');
    expect(mocks.status).toHaveBeenCalledExactlyOnceWith('user-id');
  });

  it('rejects unauthenticated requests before user or status lookup', async () => {
    mocks.readSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('returns not-ready without leaking another user status', async () => {
    mocks.resolve.mockResolvedValue(null);
    expect((await GET()).status).toBe(409);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('maps database failures to a generic private error', async () => {
    mocks.status.mockRejectedValue(new Error('private database detail'));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toEqual({ error: { code: 'unexpected_failure' } });
  });

  it('contains no provider, Spotify, AI, or external request path', () => {
    const source = readFileSync(new URL('./route.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/fetch\(|reccobeats|spotify\/client|openai|recommendation/i);
  });
});
