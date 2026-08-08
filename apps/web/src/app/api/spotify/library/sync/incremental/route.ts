import { type NextRequest, NextResponse } from 'next/server';

import { readSession } from '@/lib/auth/session';
import {
  getIncrementalSyncEligibility,
  processIncrementalLibrarySync,
} from '@/lib/spotify/incremental-library-sync';
import { FullLibrarySyncError } from '@/lib/spotify/library-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' };

function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host')?.trim();
  const fetchSite = request.headers.get('sec-fetch-site');
  const protocol =
    request.headers.get('x-forwarded-proto')?.split(',', 1)[0]?.trim() ??
    request.nextUrl.protocol.replace(/:$/, '');
  if (!origin || !host || fetchSite === 'cross-site') return false;
  try {
    return origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}

function safeError(error: unknown): NextResponse {
  const failure =
    error instanceof FullLibrarySyncError ? error : new FullLibrarySyncError('unexpected_failure');
  const status =
    failure.code === 'authorization_expired'
      ? 401
      : failure.code === 'rate_limited'
        ? 429
        : failure.code === 'sync_in_progress'
          ? 409
          : failure.code === 'temporarily_unavailable'
            ? 503
            : 500;
  const headers = new Headers(NO_STORE_HEADERS);
  if (failure.retryAfter !== null) headers.set('Retry-After', String(failure.retryAfter));
  return NextResponse.json(
    { error: { code: failure.code, retryAfter: failure.retryAfter } },
    { headers, status },
  );
}

async function session() {
  try {
    return await readSession();
  } catch {
    throw new FullLibrarySyncError('unexpected_failure');
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const authenticated = await session();
    if (!authenticated)
      return NextResponse.json(
        { error: { code: 'unauthenticated' } },
        { headers: NO_STORE_HEADERS, status: 401 },
      );
    return NextResponse.json(await getIncrementalSyncEligibility(authenticated.accountId), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return safeError(error);
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { error: { code: 'invalid_request' } },
      { headers: NO_STORE_HEADERS, status: 403 },
    );
  try {
    const authenticated = await session();
    if (!authenticated)
      return NextResponse.json(
        { error: { code: 'unauthenticated' } },
        { headers: NO_STORE_HEADERS, status: 401 },
      );
    return NextResponse.json(await processIncrementalLibrarySync(authenticated), {
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    return safeError(error);
  }
}
