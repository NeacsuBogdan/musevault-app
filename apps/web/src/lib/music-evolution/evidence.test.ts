import { describe, expect, it } from 'vitest';

import type { EvolutionHistorySummary } from './contracts';
import { calculateEvolutionEvidenceLevel, evaluateEvolutionAvailability } from './evidence';
import { buildEvolutionPeriodComparison } from './periods';

const now = new Date('2026-09-17T12:00:00.000Z');
const period = buildEvolutionPeriodComparison(7, now);

function history(overrides: Partial<EvolutionHistorySummary> = {}): EvolutionHistorySummary {
  return {
    capturedHistoryStartedAt: new Date('2026-08-01T00:00:00.000Z'),
    latestCapturedPlayAt: new Date('2026-09-16T00:00:00.000Z'),
    latestSuccessfulListeningSyncAt: new Date('2026-09-16T12:00:00.000Z'),
    current: { capturedEventCount: 20, activeDayCount: 3 },
    previous: { capturedEventCount: 20, activeDayCount: 3 },
    ...overrides,
  };
}

describe('Music Evolution availability', () => {
  it('returns every machine-readable unavailable reason in gate order', () => {
    expect(
      evaluateEvolutionAvailability(period, history({ capturedHistoryStartedAt: null })),
    ).toEqual({ available: false, reason: 'NO_CAPTURED_HISTORY' });
    expect(
      evaluateEvolutionAvailability(period, history({ latestSuccessfulListeningSyncAt: null })),
    ).toEqual({ available: false, reason: 'NO_SUCCESSFUL_SYNC' });
    expect(
      evaluateEvolutionAvailability(
        period,
        history({ capturedHistoryStartedAt: new Date('2026-09-04T00:00:00.000Z') }),
      ),
    ).toEqual({ available: false, reason: 'INSUFFICIENT_HISTORY_SPAN' });
    expect(
      evaluateEvolutionAvailability(
        period,
        history({ latestSuccessfulListeningSyncAt: new Date('2026-09-10T11:59:59.999Z') }),
      ),
    ).toEqual({ available: false, reason: 'STALE_LISTENING_DATA' });
    expect(
      evaluateEvolutionAvailability(
        period,
        history({
          current: { capturedEventCount: 0, activeDayCount: 0 },
          previous: { capturedEventCount: 0, activeDayCount: 0 },
        }),
      ),
    ).toEqual({ available: false, reason: 'NO_EVENTS_IN_COMPARISON' });
  });

  it('keeps an exactly-one-period factual zero available', () => {
    expect(
      evaluateEvolutionAvailability(
        period,
        history({ current: { capturedEventCount: 0, activeDayCount: 0 } }),
      ),
    ).toEqual({ available: true, reason: null });
  });
});

describe('Music Evolution Evidence Level', () => {
  it('is Low for a factual zero or a period below event/day thresholds', () => {
    expect(
      calculateEvolutionEvidenceLevel(
        period,
        history({ current: { capturedEventCount: 0, activeDayCount: 0 } }),
      ),
    ).toBe('LOW');
    expect(
      calculateEvolutionEvidenceLevel(
        period,
        history({ previous: { capturedEventCount: 9, activeDayCount: 6 } }),
      ),
    ).toBe('LOW');
  });

  it('is Medium when both periods meet 10 events and the scaled active-day threshold', () => {
    expect(calculateEvolutionEvidenceLevel(period, history())).toBe('MEDIUM');
  });

  it('requires both high samples and a sync no more than 48 hours old for High', () => {
    const highSamples = history({
      current: { capturedEventCount: 50, activeDayCount: 5 },
      previous: { capturedEventCount: 70, activeDayCount: 6 },
    });
    expect(calculateEvolutionEvidenceLevel(period, highSamples)).toBe('HIGH');
    expect(
      calculateEvolutionEvidenceLevel(
        period,
        history({
          ...highSamples,
          latestSuccessfulListeningSyncAt: new Date('2026-09-15T11:59:59.999Z'),
        }),
      ),
    ).toBe('MEDIUM');
  });

  it('does not accept a metric direction and therefore cannot change values or deltas', () => {
    const declining = history({
      current: { capturedEventCount: 10, activeDayCount: 2 },
      previous: { capturedEventCount: 500, activeDayCount: 7 },
    });
    const increasing = history({
      current: declining.previous,
      previous: declining.current,
    });
    expect(calculateEvolutionEvidenceLevel(period, declining)).toBe('MEDIUM');
    expect(calculateEvolutionEvidenceLevel(period, increasing)).toBe('MEDIUM');
  });
});
