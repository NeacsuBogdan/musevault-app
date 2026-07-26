import type { Metadata } from 'next';

import { DashboardShell } from '@/features/dashboard';

export const metadata: Metadata = {
  title: 'Dashboard',
  description:
    'A static preview of MuseVault listening insights, rediscovery tools, and library health.',
};

export default function DashboardPage() {
  return <DashboardShell />;
}
