import { type NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth/session';
import {
  getAudioProfileSummary,
  resolveAudioProfileUser,
} from '@/lib/db/repositories/audio-profile';
import { EnrichmentError, processEnrichmentRequest } from '@/lib/audio-features/enrichment';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin'),
    host = request.headers.get('host');
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
  const safe = error instanceof EnrichmentError ? error : new EnrichmentError('unexpected_failure');
  const status =
    safe.code === 'rate_limited' ? 429 : safe.code === 'provider_unavailable' ? 503 : 500;
  const resultHeaders = new Headers(headers);
  if (safe.retryAfter !== null) resultHeaders.set('Retry-After', String(safe.retryAfter));
  return NextResponse.json(
    { error: { code: safe.code, retryAfter: safe.retryAfter } },
    { status, headers: resultHeaders },
  );
}
export async function GET() {
  try {
    const session = await readSession();
    if (!session)
      return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401, headers });
    const userId = await resolveAudioProfileUser(session.accountId);
    if (!userId)
      return NextResponse.json({ error: { code: 'not_ready' } }, { status: 409, headers });
    return NextResponse.json(
      { provider: 'reccobeats', requiresApiKey: false, ...(await getAudioProfileSummary(userId)) },
      { headers },
    );
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
    return NextResponse.json(await processEnrichmentRequest(session.accountId), { headers });
  } catch (error) {
    return failure(error);
  }
}
