import 'server-only';

import {
  EVOLUTION_PERIOD_DAYS,
  type EvolutionPeriodComparison,
  type EvolutionPeriodDays,
} from './contracts';

const MILLISECONDS_PER_DAY = 86_400_000;

export function parseEvolutionPeriod(value: string | string[] | undefined): EvolutionPeriodDays {
  const candidate = Array.isArray(value) ? value[0] : value;
  const numeric = Number(candidate);
  return EVOLUTION_PERIOD_DAYS.includes(numeric as EvolutionPeriodDays)
    ? (numeric as EvolutionPeriodDays)
    : 7;
}

export function buildEvolutionPeriodComparison(
  periodDays: EvolutionPeriodDays,
  now: Date,
): EvolutionPeriodComparison {
  const end = now.getTime();
  const duration = periodDays * MILLISECONDS_PER_DAY;
  return {
    periodDays,
    now: new Date(end),
    current: {
      start: new Date(end - duration),
      end: new Date(end),
    },
    previous: {
      start: new Date(end - 2 * duration),
      end: new Date(end - duration),
    },
  };
}
