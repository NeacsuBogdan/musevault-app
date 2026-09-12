import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const mocks = vi.hoisted(() => ({
  readSession: vi.fn(),
  resolve: vi.fn(),
  summary: vi.fn(),
  process: vi.fn(),
  Error: class EnrichmentError extends Error {
    retryAfter: number | null = null;
    constructor(public code: string) {
      super(code);
    }
  },
}));
vi.mock('@/lib/auth/session', () => ({ readSession: mocks.readSession }));
vi.mock('@/lib/db/repositories/audio-profile', () => ({
  resolveAudioProfileUser: mocks.resolve,
  getAudioProfileSummary: mocks.summary,
}));
vi.mock('@/lib/audio-features/enrichment', () => ({
  EnrichmentError: mocks.Error,
  processEnrichmentRequest: mocks.process,
}));
import { GET, POST } from './route';
const session = {
  accountId: 'account',
  accessToken: 'hidden',
  refreshToken: 'hidden',
  displayName: 'Listener',
  imageUrl: null,
  expiresAt: 2e12,
  version: 1 as const,
};
const request = (origin = 'http://127.0.0.1:3000', body?: unknown) => {
  const headers: Record<string, string> = {
    host: '127.0.0.1:3000',
    origin,
    'sec-fetch-site': 'same-origin',
  };
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest('http://127.0.0.1:3000/api/audio-features/enrichment', {
    method: 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.readSession.mockResolvedValue(session);
  mocks.resolve.mockResolvedValue('user');
});
describe('audio enrichment route', () => {
  it('is private/no-store and reports free provider status', async () => {
    mocks.summary.mockResolvedValue({
      coverage: {
        currentSavedTrackCount: 0,
        audioCoveredTrackCount: 0,
        audioCoveragePercent: null,
        profileAvailability: 'NO_DATA',
        coverageQuality: 'LOW',
      },
    });
    const response = await GET();
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(await response.json()).toMatchObject({ provider: 'reccobeats', requiresApiKey: false });
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it('rejects cross-origin enrichment', async () => {
    expect((await POST(request('https://attacker.example'))).status).toBe(403);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it('selects current saved-library candidates for an explicit bulk batch', async () => {
    mocks.process.mockResolvedValue({ result: 'applied' });
    expect((await POST(request(undefined, { scope: 'saved_library' }))).status).toBe(200);
    expect(mocks.process).toHaveBeenCalledExactlyOnceWith('account', 'saved_library');
  });
  it('preserves the existing one-batch scope when no JSON body is sent', async () => {
    mocks.process.mockResolvedValue({ result: 'no_changes' });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.process).toHaveBeenCalledExactlyOnceWith('account', 'all_relevant');
  });
  it('rejects unsupported client authority instead of accepting track IDs', async () => {
    expect(
      (await POST(request(undefined, { scope: 'saved_library', trackIds: ['client-track'] })))
        .status,
    ).toBe(400);
    expect(mocks.process).not.toHaveBeenCalled();
  });
  it('returns safe rate limits without provider bodies', async () => {
    const error = new mocks.Error('rate_limited');
    error.retryAfter = 8;
    mocks.process.mockRejectedValue(error);
    const response = await POST(request());
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: { code: 'rate_limited', retryAfter: 8 } });
  });
});
