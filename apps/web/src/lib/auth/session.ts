import 'server-only';

import { createHash } from 'node:crypto';

import { EncryptJWT, jwtDecrypt } from 'jose';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { getSessionSecret } from '@/lib/env';

export const SESSION_COOKIE_NAME = 'musevault_session';

const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const spotifySessionSchema = z.object({
  accessToken: z.string().min(1),
  accountId: z.string().min(1),
  displayName: z.string().min(1),
  expiresAt: z.number().int().positive(),
  imageUrl: z.string().url().nullable(),
  refreshToken: z.string().min(1),
  version: z.literal(1),
});

export type SpotifySession = z.infer<typeof spotifySessionSchema>;

export type SafeSpotifySession =
  | {
      accountId: null;
      authenticated: false;
      displayName: null;
      imageUrl: null;
    }
  | {
      accountId: string;
      authenticated: true;
      displayName: string;
      imageUrl: string | null;
    };

function sessionCookieOptions() {
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}

function sessionEncryptionKey(secret: string): Uint8Array {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function parseSpotifySession(payload: unknown): SpotifySession {
  return spotifySessionSchema.parse(payload);
}

export function safeSession(session: SpotifySession | null): SafeSpotifySession {
  if (!session) {
    return {
      accountId: null,
      authenticated: false,
      displayName: null,
      imageUrl: null,
    };
  }

  return {
    accountId: session.accountId,
    authenticated: true,
    displayName: session.displayName,
    imageUrl: session.imageUrl,
  };
}

export async function encryptSession(session: SpotifySession, secret: string): Promise<string> {
  const validatedSession = parseSpotifySession(session);

  return new EncryptJWT(validatedSession)
    .setProtectedHeader({
      alg: 'dir',
      enc: 'A256GCM',
      typ: 'JWT',
    })
    .setIssuedAt()
    .setSubject(validatedSession.accountId)
    .setExpirationTime(`${SESSION_COOKIE_MAX_AGE_SECONDS}s`)
    .encrypt(sessionEncryptionKey(secret));
}

export async function decryptSession(token: string, secret: string): Promise<SpotifySession> {
  const { payload } = await jwtDecrypt(token, sessionEncryptionKey(secret), {
    contentEncryptionAlgorithms: ['A256GCM'],
    keyManagementAlgorithms: ['dir'],
  });
  const session = parseSpotifySession({
    accessToken: payload.accessToken,
    accountId: payload.accountId,
    displayName: payload.displayName,
    expiresAt: payload.expiresAt,
    imageUrl: payload.imageUrl,
    refreshToken: payload.refreshToken,
    version: payload.version,
  });

  if (payload.sub !== session.accountId) {
    throw new Error('The encrypted session subject is invalid.');
  }

  return session;
}

async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, '', {
    ...sessionCookieOptions(),
    expires: new Date(0),
    maxAge: 0,
  });
}

export async function readSession(): Promise<SpotifySession | null> {
  const cookieStore = await cookies();
  const encryptedSession = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!encryptedSession) {
    return null;
  }

  try {
    return await decryptSession(encryptedSession, getSessionSecret());
  } catch {
    try {
      await clearSessionCookie();
    } catch {
      // Server Components cannot mutate cookies. A route handler will clear the
      // invalid cookie the next time the browser calls an authentication endpoint.
    }

    return null;
  }
}

export async function writeSession(session: SpotifySession): Promise<void> {
  const encryptedSession = await encryptSession(session, getSessionSecret());
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, encryptedSession, {
    ...sessionCookieOptions(),
    expires: new Date(Date.now() + SESSION_COOKIE_MAX_AGE_SECONDS * 1_000),
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export async function deleteSession(): Promise<void> {
  await clearSessionCookie();
}
