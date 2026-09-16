import { describe, expect, it } from 'vitest';

import { buildEvolutionPeriodComparison, parseEvolutionPeriod } from './periods';

describe('Music Evolution rolling periods', () => {
  const now = new Date('2026-09-17T12:00:00.000Z');

  it.each([
    [7, '2026-09-10T12:00:00.000Z', '2026-09-03T12:00:00.000Z'],
    [30, '2026-08-18T12:00:00.000Z', '2026-07-19T12:00:00.000Z'],
    [90, '2026-06-19T12:00:00.000Z', '2026-03-21T12:00:00.000Z'],
  ] as const)(
    'builds exact injected %i-day boundaries without overlap or a gap',
    (days, currentStart, previousStart) => {
      const period = buildEvolutionPeriodComparison(days, now);
      expect(period.now).not.toBe(now);
      expect(period.current).toEqual({ start: new Date(currentStart), end: now });
      expect(period.previous).toEqual({
        start: new Date(previousStart),
        end: new Date(currentStart),
      });
      expect(period.previous.end.getTime()).toBe(period.current.start.getTime());
    },
  );

  it('accepts only 7, 30, and 90 and safely defaults every invalid input to 7', () => {
    expect(parseEvolutionPeriod('30')).toBe(30);
    expect(parseEvolutionPeriod(['90', '7'])).toBe(90);
    expect(parseEvolutionPeriod('7')).toBe(7);
    expect(parseEvolutionPeriod('calendar-month')).toBe(7);
    expect(parseEvolutionPeriod('14')).toBe(7);
    expect(parseEvolutionPeriod(undefined)).toBe(7);
  });
});
