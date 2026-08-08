import { type NextRequest, NextResponse } from 'next/server';

import { readSession } from '@/lib/auth/session';
import {
  FullLibrarySyncError,
  getFullLibrarySyncStatus,
  processFullLibrarySyncChunk,
} from '@/lib/spotify/library-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

function safeError(error: FullLibrarySyncError): NextResponse {
  const status =
    error.code === 'sync_in_progress'
      ? 409
      : error.code === 'authorization_expired'
        ? 401
        : error.code === 'rate_limited'
          ? 429
          : error.code === 'database_failure' || error.code === 'unexpected_failure'
            ? 500
            : 503;
  const headers = new Headers(NO_STORE_HEADERS);

  if (error.retryAfter !== null) headers.set('Retry-After', String(error.retryAfter));

  return NextResponse.json(
    { error: { code: error.code, retryAfter: error.retryAfter } },
    { headers, status },
  );
}

async function authenticatedSession() {
  try {
    return await readSession();
  } catch {
    throw new FullLibrarySyncError('unexpected_failure');
  }
}

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  const host = request.headers.get('host')?.trim();
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',', 1)[0]?.trim();
  const protocol = forwardedProtocol ?? request.nextUrl.protocol.replace(/:$/, '');

  if (!origin || !host || fetchSite === 'cross-site') return false;

  try {
    return origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await authenticatedSession();
    if (!session) {
      return NextResponse.json(
        { error: { code: 'unauthenticated' } },
        { headers: NO_STORE_HEADERS, status: 401 },
      );
    }

    return NextResponse.json(await getFullLibrarySyncStatus(session.accountId), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return safeError(
      error instanceof FullLibrarySyncError
        ? error
        : new FullLibrarySyncError('unexpected_failure'),
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: { code: 'invalid_request' } },
      { headers: NO_STORE_HEADERS, status: 403 },
    );
  }

  try {
    const session = await authenticatedSession();
    if (!session) {
      return NextResponse.json(
        { error: { code: 'unauthenticated' } },
        { headers: NO_STORE_HEADERS, status: 401 },
      );
    }

    return NextResponse.json(await processFullLibrarySyncChunk(session), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return safeError(
      error instanceof FullLibrarySyncError
        ? error
        : new FullLibrarySyncError('unexpected_failure'),
    );
  }
}
