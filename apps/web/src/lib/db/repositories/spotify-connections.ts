import 'server-only';

import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { withDatabase } from '@/lib/db/client';
import { spotifyConnections, users } from '@/lib/db/schema';
import {
  encryptSpotifyRefreshToken,
  SPOTIFY_TOKEN_ENCRYPTION_VERSION,
} from '@/lib/spotify/token-encryption';

const spotifyIdentifierSchema = z.string().trim().min(1);
const displayNameSchema = z.string().trim().min(1);
const refreshTokenSchema = z.string().refine((value) => value.trim().length > 0);
const spotifyScopeSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/);

function hasHttpsProtocol(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

const imageUrlSchema = z.string().trim().url().refine(hasHttpsProtocol).nullable();

const spotifyConnectionInputSchema = z
  .object({
    displayName: displayNameSchema,
    grantedScopes: z.array(spotifyScopeSchema).min(1),
    imageUrl: imageUrlSchema,
    refreshToken: refreshTokenSchema,
    spotifyAccountId: spotifyIdentifierSchema,
  })
  .strict();

export interface UpsertSpotifyUserAndConnectionInput {
  readonly displayName: string;
  readonly grantedScopes: readonly string[];
  readonly imageUrl: string | null;
  readonly refreshToken: string;
  readonly spotifyAccountId: string;
}

export interface NormalizedSpotifyConnectionInput {
  displayName: string;
  grantedScopes: string[];
  imageUrl: string | null;
  refreshToken: string;
  spotifyAccountId: string;
}

export interface SafeSpotifyUser {
  displayName: string;
  imageUrl: string | null;
  spotifyAccountId: string;
  userId: string;
}

export interface UpsertSpotifyUserRecord {
  displayName: string;
  imageUrl: string | null;
  spotifyAccountId: string;
  updatedAt: Date;
}

export interface UpsertSpotifyConnectionRecord {
  encryptedRefreshToken: string;
  scopes: string[];
  tokenEncryptionVersion: number;
  updatedAt: Date;
  userId: string;
}

export interface SpotifyConnectionTransactionPort {
  upsertConnection(record: UpsertSpotifyConnectionRecord): Promise<void>;
  upsertUser(record: UpsertSpotifyUserRecord): Promise<SafeSpotifyUser>;
}

export interface SpotifyConnectionStorePort {
  findSafeUserBySpotifyAccountId(spotifyAccountId: string): Promise<SafeSpotifyUser | null>;
  transaction<T>(
    operation: (transaction: SpotifyConnectionTransactionPort) => Promise<T>,
  ): Promise<T>;
}

export interface SpotifyConnectionsRepository {
  findUserBySpotifyAccountId(spotifyAccountId: string): Promise<SafeSpotifyUser | null>;
  upsertSpotifyUserAndConnection(
    input: UpsertSpotifyUserAndConnectionInput,
  ): Promise<SafeSpotifyUser>;
}

interface SpotifyConnectionsRepositoryDependencies {
  encryptRefreshToken: (refreshToken: string) => string;
  now: () => Date;
  store: SpotifyConnectionStorePort;
}

export type SpotifyConnectionRepositoryOperation = 'find_user' | 'upsert_connection';

export class SpotifyConnectionInputError extends Error {
  constructor() {
    super('Invalid Spotify connection input.');
    this.name = 'SpotifyConnectionInputError';
  }
}

export class SpotifyConnectionRepositoryError extends Error {
  readonly operation: SpotifyConnectionRepositoryOperation;

  constructor(operation: SpotifyConnectionRepositoryOperation) {
    super(
      operation === 'find_user'
        ? 'The Spotify user lookup failed.'
        : 'The Spotify connection could not be persisted.',
    );
    this.name = 'SpotifyConnectionRepositoryError';
    this.operation = operation;
  }
}

export function normalizeSpotifyConnectionInput(
  input: UpsertSpotifyUserAndConnectionInput,
): NormalizedSpotifyConnectionInput {
  const result = spotifyConnectionInputSchema.safeParse(input);

  if (!result.success) {
    throw new SpotifyConnectionInputError();
  }

  return {
    ...result.data,
    grantedScopes: [...new Set(result.data.grantedScopes)].sort(),
  };
}

function normalizeSpotifyAccountId(spotifyAccountId: string): string {
  const result = spotifyIdentifierSchema.safeParse(spotifyAccountId);

  if (!result.success) {
    throw new SpotifyConnectionInputError();
  }

  return result.data;
}

const safeUserSelection = {
  displayName: users.displayName,
  imageUrl: users.imageUrl,
  spotifyAccountId: users.spotifyAccountId,
  userId: users.id,
};

function createDrizzleSpotifyConnectionStore(): SpotifyConnectionStorePort {
  return {
    async findSafeUserBySpotifyAccountId(
      spotifyAccountId: string,
    ): Promise<SafeSpotifyUser | null> {
      return withDatabase(async (database) => {
        const [user] = await database
          .select(safeUserSelection)
          .from(users)
          .where(eq(users.spotifyAccountId, spotifyAccountId))
          .limit(1);

        return user ?? null;
      });
    },

    async transaction<T>(
      operation: (transaction: SpotifyConnectionTransactionPort) => Promise<T>,
    ): Promise<T> {
      return withDatabase((database) =>
        database.transaction(async (databaseTransaction) => {
          const transaction: SpotifyConnectionTransactionPort = {
            async upsertConnection(record): Promise<void> {
              await databaseTransaction
                .insert(spotifyConnections)
                .values({
                  encryptedRefreshToken: record.encryptedRefreshToken,
                  scopes: record.scopes,
                  tokenEncryptionVersion: record.tokenEncryptionVersion,
                  updatedAt: record.updatedAt,
                  userId: record.userId,
                })
                .onConflictDoUpdate({
                  set: {
                    encryptedRefreshToken: record.encryptedRefreshToken,
                    scopes: record.scopes,
                    tokenEncryptionVersion: record.tokenEncryptionVersion,
                    updatedAt: record.updatedAt,
                  },
                  target: spotifyConnections.userId,
                });
            },

            async upsertUser(record): Promise<SafeSpotifyUser> {
              const [user] = await databaseTransaction
                .insert(users)
                .values({
                  displayName: record.displayName,
                  imageUrl: record.imageUrl,
                  spotifyAccountId: record.spotifyAccountId,
                  updatedAt: record.updatedAt,
                })
                .onConflictDoUpdate({
                  set: {
                    displayName: record.displayName,
                    imageUrl: record.imageUrl,
                    updatedAt: record.updatedAt,
                  },
                  target: users.spotifyAccountId,
                })
                .returning(safeUserSelection);

              if (!user) {
                throw new SpotifyConnectionRepositoryError('upsert_connection');
              }

              return user;
            },
          };

          return operation(transaction);
        }),
      );
    },
  };
}

export function createSpotifyConnectionsRepository(
  dependencies: SpotifyConnectionsRepositoryDependencies,
): SpotifyConnectionsRepository {
  return {
    async findUserBySpotifyAccountId(spotifyAccountId: string): Promise<SafeSpotifyUser | null> {
      const normalizedAccountId = normalizeSpotifyAccountId(spotifyAccountId);

      try {
        return await dependencies.store.findSafeUserBySpotifyAccountId(normalizedAccountId);
      } catch {
        throw new SpotifyConnectionRepositoryError('find_user');
      }
    },

    async upsertSpotifyUserAndConnection(
      input: UpsertSpotifyUserAndConnectionInput,
    ): Promise<SafeSpotifyUser> {
      const normalizedInput = normalizeSpotifyConnectionInput(input);
      const encryptedRefreshToken = dependencies.encryptRefreshToken(normalizedInput.refreshToken);
      const updatedAt = dependencies.now();

      try {
        return await dependencies.store.transaction(async (transaction) => {
          const user = await transaction.upsertUser({
            displayName: normalizedInput.displayName,
            imageUrl: normalizedInput.imageUrl,
            spotifyAccountId: normalizedInput.spotifyAccountId,
            updatedAt,
          });

          await transaction.upsertConnection({
            encryptedRefreshToken,
            scopes: normalizedInput.grantedScopes,
            tokenEncryptionVersion: SPOTIFY_TOKEN_ENCRYPTION_VERSION,
            updatedAt,
            userId: user.userId,
          });

          return user;
        });
      } catch {
        throw new SpotifyConnectionRepositoryError('upsert_connection');
      }
    },
  };
}

const spotifyConnectionsRepository = createSpotifyConnectionsRepository({
  encryptRefreshToken: encryptSpotifyRefreshToken,
  now: () => new Date(),
  store: createDrizzleSpotifyConnectionStore(),
});

export function findUserBySpotifyAccountId(
  spotifyAccountId: string,
): Promise<SafeSpotifyUser | null> {
  return spotifyConnectionsRepository.findUserBySpotifyAccountId(spotifyAccountId);
}

export function upsertSpotifyUserAndConnection(
  input: UpsertSpotifyUserAndConnectionInput,
): Promise<SafeSpotifyUser> {
  return spotifyConnectionsRepository.upsertSpotifyUserAndConnection(input);
}
