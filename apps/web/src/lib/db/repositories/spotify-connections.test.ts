import { describe, expect, it, vi } from 'vitest';

import { SPOTIFY_TOKEN_ENCRYPTION_VERSION } from '@/lib/spotify/token-encryption';

import {
  createSpotifyConnectionsRepository,
  normalizeSpotifyConnectionInput,
  type SafeSpotifyUser,
  type SpotifyConnectionStorePort,
  SpotifyConnectionInputError,
  SpotifyConnectionRepositoryError,
  type SpotifyConnectionTransactionPort,
  type UpsertSpotifyConnectionRecord,
  type UpsertSpotifyUserAndConnectionInput,
  type UpsertSpotifyUserRecord,
} from './spotify-connections';

interface StoredConnection extends UpsertSpotifyConnectionRecord {
  connectedAt: Date;
  lastSuccessfulSyncAt: Date | null;
}

class AtomicMemoryStore implements SpotifyConnectionStorePort {
  readonly connectionWrites: Array<UpsertSpotifyConnectionRecord & { insideTransaction: boolean }> =
    [];
  readonly connections = new Map<string, StoredConnection>();
  readonly events: string[];
  readonly userWrites: Array<UpsertSpotifyUserRecord & { insideTransaction: boolean }> = [];
  readonly users = new Map<string, SafeSpotifyUser>();

  failConnectionWrites = false;
  transactionCount = 0;

  private nextUserId = 1;
  private transactionActive = false;

  constructor(events: string[] = []) {
    this.events = events;
  }

  async findSafeUserBySpotifyAccountId(spotifyAccountId: string): Promise<SafeSpotifyUser | null> {
    return this.users.get(spotifyAccountId) ?? null;
  }

  async transaction<T>(
    operation: (transaction: SpotifyConnectionTransactionPort) => Promise<T>,
  ): Promise<T> {
    this.events.push('transaction');
    this.transactionCount += 1;

    const usersSnapshot = new Map<string, SafeSpotifyUser>(
      [...this.users].map(([key, value]) => [key, { ...value }]),
    );
    const connectionsSnapshot = new Map<string, StoredConnection>(
      [...this.connections].map(([key, value]) => [key, { ...value, scopes: [...value.scopes] }]),
    );

    this.transactionActive = true;

    const transaction: SpotifyConnectionTransactionPort = {
      upsertConnection: async (record) => {
        this.connectionWrites.push({
          ...record,
          insideTransaction: this.transactionActive,
          scopes: [...record.scopes],
        });

        if (this.failConnectionWrites) {
          throw new Error('simulated connection write failure');
        }

        const existing = this.connections.get(record.userId);

        this.connections.set(record.userId, {
          ...record,
          connectedAt: existing?.connectedAt ?? new Date('2026-01-01T00:00:00.000Z'),
          lastSuccessfulSyncAt: existing?.lastSuccessfulSyncAt ?? null,
          scopes: [...record.scopes],
        });
      },

      upsertUser: async (record) => {
        this.userWrites.push({
          ...record,
          insideTransaction: this.transactionActive,
        });

        const existing = this.users.get(record.spotifyAccountId);
        const user: SafeSpotifyUser = {
          displayName: record.displayName,
          imageUrl: record.imageUrl,
          spotifyAccountId: record.spotifyAccountId,
          userId: existing?.userId ?? `user-${this.nextUserId++}`,
        };

        this.users.set(record.spotifyAccountId, user);

        return user;
      },
    };

    try {
      return await operation(transaction);
    } catch (error) {
      this.users.clear();
      this.connections.clear();

      for (const [key, value] of usersSnapshot) {
        this.users.set(key, value);
      }

      for (const [key, value] of connectionsSnapshot) {
        this.connections.set(key, value);
      }

      throw error;
    } finally {
      this.transactionActive = false;
    }
  }
}

const TEST_DATE = new Date('2026-07-31T12:00:00.000Z');

function input(
  overrides: Partial<UpsertSpotifyUserAndConnectionInput> = {},
): UpsertSpotifyUserAndConnectionInput {
  return {
    displayName: 'MuseVault Listener',
    grantedScopes: ['user-library-read', 'user-read-private'],
    imageUrl: 'https://i.scdn.co/image/profile',
    refreshToken: 'opaque-refresh-token',
    spotifyAccountId: 'spotify-account-id',
    ...overrides,
  };
}

function repositoryWith(
  store: SpotifyConnectionStorePort,
  encryptRefreshToken: (refreshToken: string) => string = () => 'encrypted-token',
) {
  return createSpotifyConnectionsRepository({
    encryptRefreshToken,
    now: () => TEST_DATE,
    store,
  });
}

describe('Spotify connection input normalization', () => {
  it('trims profile fields and returns unique scopes in deterministic order', () => {
    expect(
      normalizeSpotifyConnectionInput(
        input({
          displayName: '  MuseVault Listener  ',
          grantedScopes: [' user-read-private ', 'user-library-read', 'user-read-private'],
          imageUrl: '  https://i.scdn.co/image/profile  ',
          spotifyAccountId: '  spotify-account-id  ',
        }),
      ),
    ).toEqual({
      displayName: 'MuseVault Listener',
      grantedScopes: ['user-library-read', 'user-read-private'],
      imageUrl: 'https://i.scdn.co/image/profile',
      refreshToken: 'opaque-refresh-token',
      spotifyAccountId: 'spotify-account-id',
    });
  });

  it('preserves a nullable image and the exact opaque refresh token', () => {
    const refreshToken = ' token-with-significant-surrounding-space ';
    const normalized = normalizeSpotifyConnectionInput(input({ imageUrl: null, refreshToken }));

    expect(normalized.imageUrl).toBeNull();
    expect(normalized.refreshToken).toBe(refreshToken);
  });

  it.each([
    input({ spotifyAccountId: '   ' }),
    input({ displayName: '   ' }),
    input({ refreshToken: '   ' }),
    input({ grantedScopes: [] }),
    input({ grantedScopes: ['   '] }),
    input({ grantedScopes: ['user library read'] }),
    input({ imageUrl: 'http://i.scdn.co/image/profile' }),
  ])('rejects invalid input without including its values in the error', (invalidInput) => {
    let error: unknown;

    try {
      normalizeSpotifyConnectionInput(invalidInput);
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(SpotifyConnectionInputError);
    expect((error as Error).message).toBe('Invalid Spotify connection input.');
    expect((error as Error).message).not.toContain(invalidInput.refreshToken);
  });
});

describe('Spotify connections repository', () => {
  it('encrypts before one transaction and persists both records without plaintext', async () => {
    const events: string[] = [];
    const store = new AtomicMemoryStore(events);
    const encryptRefreshToken = vi.fn((refreshToken: string) => {
      events.push('encrypt');
      expect(refreshToken).toBe('opaque-refresh-token');

      return 'ciphertext-only';
    });
    const repository = repositoryWith(store, encryptRefreshToken);

    const result = await repository.upsertSpotifyUserAndConnection(input());

    expect(events).toEqual(['encrypt', 'transaction']);
    expect(store.transactionCount).toBe(1);
    expect(store.userWrites).toHaveLength(1);
    expect(store.connectionWrites).toHaveLength(1);
    expect(store.userWrites[0]?.insideTransaction).toBe(true);
    expect(store.connectionWrites[0]).toMatchObject({
      encryptedRefreshToken: 'ciphertext-only',
      insideTransaction: true,
      scopes: ['user-library-read', 'user-read-private'],
      tokenEncryptionVersion: SPOTIFY_TOKEN_ENCRYPTION_VERSION,
      updatedAt: TEST_DATE,
      userId: 'user-1',
    });
    expect(JSON.stringify(store.connectionWrites)).not.toContain('opaque-refresh-token');
    expect(result).toEqual({
      displayName: 'MuseVault Listener',
      imageUrl: 'https://i.scdn.co/image/profile',
      spotifyAccountId: 'spotify-account-id',
      userId: 'user-1',
    });
    expect(Object.keys(result).sort()).toEqual([
      'displayName',
      'imageUrl',
      'spotifyAccountId',
      'userId',
    ]);
  });

  it('rolls back the user write when the connection write fails', async () => {
    const store = new AtomicMemoryStore();
    store.failConnectionWrites = true;
    const repository = repositoryWith(store);

    await expect(repository.upsertSpotifyUserAndConnection(input())).rejects.toMatchObject({
      message: 'The Spotify connection could not be persisted.',
      operation: 'upsert_connection',
    });

    expect(store.transactionCount).toBe(1);
    expect(store.users.size).toBe(0);
    expect(store.connections.size).toBe(0);
  });

  it('updates profile, ciphertext, and scopes on reconnection while preserving metadata', async () => {
    const store = new AtomicMemoryStore();
    const encryptRefreshToken = vi.fn((refreshToken: string) =>
      refreshToken === 'first-refresh-token' ? 'first-ciphertext' : 'second-ciphertext',
    );
    const repository = repositoryWith(store, encryptRefreshToken);

    const first = await repository.upsertSpotifyUserAndConnection(
      input({ refreshToken: 'first-refresh-token' }),
    );
    const originalConnection = store.connections.get(first.userId);
    const lastSuccessfulSyncAt = new Date('2026-07-30T10:00:00.000Z');

    if (!originalConnection) {
      throw new Error('Expected the first connection to exist.');
    }

    originalConnection.lastSuccessfulSyncAt = lastSuccessfulSyncAt;

    const second = await repository.upsertSpotifyUserAndConnection(
      input({
        displayName: 'Updated Listener',
        grantedScopes: ['user-read-private'],
        imageUrl: null,
        refreshToken: 'second-refresh-token',
      }),
    );
    const reconnected = store.connections.get(first.userId);

    expect(second).toEqual({
      displayName: 'Updated Listener',
      imageUrl: null,
      spotifyAccountId: 'spotify-account-id',
      userId: first.userId,
    });
    expect(reconnected).toMatchObject({
      connectedAt: originalConnection.connectedAt,
      encryptedRefreshToken: 'second-ciphertext',
      lastSuccessfulSyncAt,
      scopes: ['user-read-private'],
      userId: first.userId,
    });
    expect(store.connectionWrites[1]).not.toHaveProperty('connectedAt');
    expect(store.connectionWrites[1]).not.toHaveProperty('lastSuccessfulSyncAt');
  });

  it('normalizes lookup input and returns only a safe user projection', async () => {
    const store = new AtomicMemoryStore();
    const repository = repositoryWith(store);
    const persisted = await repository.upsertSpotifyUserAndConnection(input());

    await expect(repository.findUserBySpotifyAccountId('  spotify-account-id  ')).resolves.toEqual(
      persisted,
    );
    await expect(repository.findUserBySpotifyAccountId('missing-account')).resolves.toBeNull();
  });

  it('replaces store errors with a fixed message that cannot expose database details', async () => {
    const privateDriverDetail = 'internal-driver-detail-should-not-escape';
    const store: SpotifyConnectionStorePort = {
      findSafeUserBySpotifyAccountId: async () => {
        throw new Error(privateDriverDetail);
      },
      transaction: async () => {
        throw new Error(privateDriverDetail);
      },
    };
    const repository = repositoryWith(store);

    for (const operation of [
      repository.findUserBySpotifyAccountId('spotify-account-id'),
      repository.upsertSpotifyUserAndConnection(input()),
    ]) {
      let error: unknown;

      try {
        await operation;
      } catch (caughtError) {
        error = caughtError;
      }

      expect(error).toBeInstanceOf(SpotifyConnectionRepositoryError);
      expect((error as Error).message).not.toContain(privateDriverDetail);
      expect((error as Error).cause).toBeUndefined();
    }
  });
});
