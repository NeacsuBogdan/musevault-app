import { PgDialect } from 'drizzle-orm/pg-core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ where: vi.fn(), limit: vi.fn() }));
vi.mock('@/lib/db/client', () => ({
  withDatabase: (operation: (database: unknown) => unknown) =>
    operation({
      select: () => ({
        from: () => ({
          innerJoin: () => ({
            where: (predicate: unknown) => {
              mocks.where(predicate);
              return { limit: mocks.limit };
            },
          }),
        }),
      }),
    }),
}));
import { getSpotifyPlaylistExportCapability } from './spotify-playlist-export';

beforeEach(() => vi.clearAllMocks());
describe('stored optional export capability', () => {
  it.each([
    { rows: [], expected: false },
    {
      rows: [
        {
          scopes: [
            'user-library-read',
            'user-read-private',
            'user-read-recently-played',
            'user-top-read',
          ],
        },
      ],
      expected: false,
    },
    { rows: [{ scopes: ['playlist-modify-public'] }], expected: false },
    { rows: [{ scopes: ['user-library-read', 'playlist-modify-private'] }], expected: true },
  ])(
    'reads private export capability from the current account only %#',
    async ({ rows, expected }) => {
      mocks.limit.mockResolvedValue(rows);
      expect(await getSpotifyPlaylistExportCapability('current-account')).toBe(expected);
      const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]![0]);
      expect(query.sql).toContain('"users"."spotify_account_id"');
      expect(query.params).toEqual(['current-account']);
      expect(mocks.limit).toHaveBeenCalledWith(1);
    },
  );
});
