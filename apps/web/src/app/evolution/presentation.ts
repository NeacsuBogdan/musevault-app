import 'server-only';

import type { EvolutionEvidenceLevel, MetricComparison } from '@/lib/music-evolution/contracts';

export type EvolutionPresentationTone = 'evidence' | 'neutral';

interface EvolutionPresentation {
  text: string;
  tone: EvolutionPresentationTone;
  className: string;
}

const toneClassNames: Record<EvolutionPresentationTone, string> = {
  evidence: 'bg-accent-green/10 text-accent-green',
  neutral: 'bg-surface-hover text-text-secondary',
};

export function getComparisonBadgePresentation(
  input: { available: true; evidenceLevel: EvolutionEvidenceLevel } | { available: false },
): EvolutionPresentation {
  const tone = input.available ? 'evidence' : 'neutral';
  return {
    text: input.available ? `Evidence Level: ${input.evidenceLevel}` : 'Comparison unavailable',
    tone,
    className: toneClassNames[tone],
  };
}

function signedDelta(value: number, suffix = ''): string {
  return `${value > 0 ? '+' : ''}${value}${suffix}`;
}

export function getListeningDeltaPresentation(
  comparison: MetricComparison,
  percentage = false,
): EvolutionPresentation {
  const value =
    comparison.delta === null
      ? null
      : percentage
        ? Number(comparison.delta.toFixed(1))
        : comparison.delta;
  return {
    text: value === null ? 'Unavailable' : signedDelta(value, percentage ? ' pts' : ''),
    tone: 'neutral',
    className: 'text-text-secondary',
  };
}

export function getMovementDeltaPresentation(delta: number): EvolutionPresentation {
  return {
    text: signedDelta(delta),
    tone: 'neutral',
    className: 'text-text-secondary',
  };
}
