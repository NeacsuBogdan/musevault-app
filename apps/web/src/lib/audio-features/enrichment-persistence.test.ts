import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getCandidates: vi.fn(),
  getSavedCandidates: vi.fn(),
  insertedFeatureRows: [] as Record<string, unknown>[][],
  providerLoad: vi.fn(),
  resolveUser: vi.fn(),
  runUpdates: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/db/repositories/audio-profile', () => ({
  getEnrichmentCandidates: mocks.getCandidates,
  getSavedEnrichmentCandidates: mocks.getSavedCandidates,
  NOT_FOUND_COOLDOWN_MS: 30 * 86_400_000,
  resolveAudioProfileUser: mocks.resolveUser,
}));

vi.mock('./reccobeats', () => ({
  reccoBeatsProvider: {
    name: 'reccobeats',
    loadForSpotifyTrackIds: mocks.providerLoad,
  },
}));

vi.mock('@/lib/db/client', () => ({
  withDatabase: async (operation: (database: unknown) => unknown) =>
    operation({
      transaction: async (callback: (transaction: unknown) => unknown) =>
        callback({
          execute: vi.fn(),
          insert: () => ({
            values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
              if (Array.isArray(values)) {
                mocks.insertedFeatureRows.push(values);
                return { onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
              }
              return { returning: vi.fn().mockResolvedValue([{ id: 'run-id' }]) };
            },
          }),
        }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          mocks.runUpdates.push(values);
          return { where: vi.fn().mockResolvedValue(undefined) };
        },
      }),
    }),
}));

import { processEnrichmentRequest } from './enrichment';
import { AudioFeatureProviderError, type ProviderAudioFeatures } from './provider';

const feature = (spotifyTrackId = 'spotify-a'): ProviderAudioFeatures => ({
  spotifyTrackId,
  providerTrackId: `provider-${spotifyTrackId}`,
  acousticness: 0.1,
  danceability: 0.2,
  energy: 0.3,
  instrumentalness: 0.4,
  liveness: 0.5,
  loudness: -8,
  speechiness: 0.6,
  tempo: 120,
  valence: 0.7,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.insertedFeatureRows.length = 0;
  mocks.runUpdates.length = 0;
  mocks.resolveUser.mockResolvedValue('user-id');
  mocks.getCandidates.mockResolvedValue(['spotify-a']);
  mocks.getSavedCandidates.mockResolvedValue(['spotify-a']);
});

describe('confirmed-omission persistence', () => {
  it('caches recovered features normally without writing not_found', async () => {
    mocks.providerLoad.mockResolvedValue({
      available: [feature()],
      notFoundSpotifyTrackIds: [],
    });

    await expect(processEnrichmentRequest('account-id')).resolves.toMatchObject({
      attemptedTrackCount: 1,
      enrichedTrackCount: 1,
      notFoundTrackCount: 0,
    });

    expect(mocks.insertedFeatureRows.flat()).toEqual([
      expect.objectContaining({ trackId: 'spotify-a', status: 'available', retryAfterAt: null }),
    ]);
  });

  it('writes a 30-day not_found row only for provider-confirmed omissions', async () => {
    mocks.providerLoad.mockResolvedValue({
      available: [],
      notFoundSpotifyTrackIds: ['spotify-a'],
    });

    await processEnrichmentRequest('account-id');

    const rows = mocks.insertedFeatureRows.flat();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ trackId: 'spotify-a', status: 'not_found' });
    expect((rows[0]?.retryAfterAt as Date).getTime() - (rows[0]?.updatedAt as Date).getTime()).toBe(
      30 * 86_400_000,
    );
  });

  it.each([
    ['rate_limited', 9],
    ['provider_unavailable', null],
    ['provider_invalid_response', null],
  ] as const)('never writes not_found after a %s provider failure', async (code, retryAfter) => {
    mocks.providerLoad.mockRejectedValue(new AudioFeatureProviderError(code, retryAfter));

    await expect(processEnrichmentRequest('account-id')).rejects.toMatchObject({
      code,
      retryAfter,
    });

    expect(mocks.insertedFeatureRows).toEqual([]);
    expect(mocks.runUpdates.at(-1)).toMatchObject({
      status: 'failed',
      notFoundTrackCount: 0,
    });
  });

  it.each([
    ['rate_limited', 9],
    ['provider_unavailable', null],
    ['provider_invalid_response', null],
  ] as const)(
    'preserves valid first-response features but writes no missing row when confirmation is %s',
    async (code, retryAfter) => {
      mocks.providerLoad.mockRejectedValue(
        new AudioFeatureProviderError(code, retryAfter, [feature()]),
      );

      await expect(processEnrichmentRequest('account-id')).rejects.toMatchObject({
        code,
        retryAfter,
      });

      const rows = mocks.insertedFeatureRows.flat();
      expect(rows).toEqual([
        expect.objectContaining({ trackId: 'spotify-a', status: 'available' }),
      ]);
      expect(rows.some((row) => row.status === 'not_found')).toBe(false);
      expect(mocks.runUpdates.at(-1)).toMatchObject({
        attemptedTrackCount: 1,
        enrichedTrackCount: 1,
        notFoundTrackCount: 0,
        status: 'failed',
      });
    },
  );
});
