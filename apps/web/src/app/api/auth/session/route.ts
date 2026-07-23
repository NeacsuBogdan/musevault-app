import { NextResponse } from 'next/server';

import { readSession, safeSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const session = await readSession();

    return NextResponse.json(safeSession(session), {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json(safeSession(null), {
      headers: {
        'Cache-Control': 'no-store',
      },
      status: 503,
    });
  }
}
