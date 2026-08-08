import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { DashboardShell } from '@/features/dashboard';
import { loadDashboardData } from '@/features/dashboard/data/dashboard-data';
import { createDashboardProfile } from '@/features/dashboard/data/dashboard-view-model';
import { readSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'View your synchronized Spotify library snapshot and MuseVault feature previews.',
};

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const session = await readSession();
  if (!session) redirect('/');

  const profile = createDashboardProfile({
    displayName: session.displayName,
    imageUrl: session.imageUrl,
  });
  return <DashboardShell profile={profile} state={await loadDashboardData(session)} />;
}
