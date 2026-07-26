import {
  ChartNoAxesCombined,
  Clock3,
  Compass,
  Disc3,
  Gem,
  Heart,
  History,
  LayoutDashboard,
  ListMusic,
  Mic2,
  Music2,
  Settings,
  WandSparkles,
  type LucideIcon,
  type LucideProps,
} from 'lucide-react';

import type { DashboardIconName } from '../types';

const dashboardIcons: Record<DashboardIconName, LucideIcon> = {
  analytics: ChartNoAxesCombined,
  artists: Mic2,
  clock: Clock3,
  discover: Compass,
  gem: Gem,
  heart: Heart,
  history: History,
  music: Music2,
  overview: LayoutDashboard,
  playlists: ListMusic,
  settings: Settings,
  sparkles: WandSparkles,
  wrapped: Disc3,
};

interface DashboardIconProps extends Omit<LucideProps, 'ref'> {
  name: DashboardIconName;
}

export function DashboardIcon({ name, ...props }: DashboardIconProps) {
  const Icon = dashboardIcons[name];

  return <Icon {...props} aria-hidden="true" focusable="false" />;
}
