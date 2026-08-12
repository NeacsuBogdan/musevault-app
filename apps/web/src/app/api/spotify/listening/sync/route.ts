import { type NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import { getListeningInsights } from '@/lib/db/repositories/listening-intelligence';
import { ListeningSyncError, processListeningSyncChunk } from '@/lib/spotify/listening-sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  const protocol =
    request.headers.get('x-forwarded-proto')?.split(',', 1)[0]?.trim() ??
    request.nextUrl.protocol.replace(/:$/, '');
  if (!origin || !host || request.headers.get('sec-fetch-site') === 'cross-site') return false;
  try {
    return origin === new URL(`${protocol}://${host}`).origin;
  } catch {
    return false;
  }
}
function failure(error: unknown) {
  const safe =
    error instanceof ListeningSyncError ? error : new ListeningSyncError('unexpected_failure');
  const status =
    safe.code === 'authorization_required'
      ? 403
      : safe.code === 'rate_limited'
        ? 429
        : safe.code === 'spotify_unavailable'
          ? 503
          : 500;
  const responseHeaders = new Headers(headers);
  if (safe.retryAfter !== null) responseHeaders.set('Retry-After', String(safe.retryAfter));
  return NextResponse.json(
    { error: { code: safe.code, retryAfter: safe.retryAfter } },
    { status, headers: responseHeaders },
  );
}
export async function GET() {
  try {
    const session = await readSession();
    if (!session)
      return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401, headers });
    return NextResponse.json(await getListeningInsights(session.accountId), { headers });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json({ error: { code: 'invalid_request' } }, { status: 403, headers });
  try {
    const session = await readSession();
    if (!session)
      return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401, headers });
    return NextResponse.json(await processListeningSyncChunk(session), { headers });
  } catch (error) {
    return failure(error);
  }
}
