import { NextResponse } from 'next/server';

import { readSession } from '@/lib/auth/session';
import {
  getAudioEnrichmentStatus,
  resolveAudioProfileUser,
} from '@/lib/db/repositories/audio-profile';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const headers = { 'Cache-Control': 'private, no-store' };

export async function GET() {
  try {
    const session = await readSession();
    if (!session)
      return NextResponse.json({ error: { code: 'unauthenticated' } }, { status: 401, headers });
    const userId = await resolveAudioProfileUser(session.accountId);
    if (!userId)
      return NextResponse.json({ error: { code: 'not_ready' } }, { status: 409, headers });
    return NextResponse.json(await getAudioEnrichmentStatus(userId), { headers });
  } catch {
    return NextResponse.json({ error: { code: 'unexpected_failure' } }, { status: 500, headers });
  }
}
