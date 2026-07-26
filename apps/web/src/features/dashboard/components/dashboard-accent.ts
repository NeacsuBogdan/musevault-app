import type { AccentTone } from '../types';

export const accentTextClasses: Record<AccentTone, string> = {
  green: 'text-accent-green',
  purple: 'text-accent-purple',
  blue: 'text-accent-blue',
  pink: 'text-accent-pink',
  yellow: 'text-accent-yellow',
};

export const accentSurfaceClasses: Record<AccentTone, string> = {
  green: 'bg-accent-green/10 text-accent-green',
  purple: 'bg-accent-purple/10 text-accent-purple',
  blue: 'bg-accent-blue/10 text-accent-blue',
  pink: 'bg-accent-pink/10 text-accent-pink',
  yellow: 'bg-accent-yellow/10 text-accent-yellow',
};

export const accentGradientClasses: Record<AccentTone, string> = {
  green: 'from-accent-green/14 via-accent-green/5 to-transparent',
  purple: 'from-accent-purple/14 via-accent-purple/5 to-transparent',
  blue: 'from-accent-blue/14 via-accent-blue/5 to-transparent',
  pink: 'from-accent-pink/14 via-accent-pink/5 to-transparent',
  yellow: 'from-accent-yellow/14 via-accent-yellow/5 to-transparent',
};

export const accentStrokeClasses: Record<AccentTone, string> = {
  green: 'stroke-accent-green',
  purple: 'stroke-accent-purple',
  blue: 'stroke-accent-blue',
  pink: 'stroke-accent-pink',
  yellow: 'stroke-accent-yellow',
};
