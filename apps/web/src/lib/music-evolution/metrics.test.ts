import { describe, expect, it } from 'vitest';

import {
  buildListeningPeriodMetrics,
  buildListeningShift,
  compareMetric,
  rankMovement,
} from './metrics';

describe('Listening Shift metrics', () => {
  it('preserves event, track, credited-artist, active-day, repeat, and concentration semantics', () => {
    const current = buildListeningPeriodMetrics({
      capturedPlayCount: 10,
      uniqueTrackCount: 4,
      uniqueArtistCount: 7,
      activeDayCount: 3,
      repeatedTrackEventCount: 8,
      topFiveTrackEventCount: 9,
      topFivePrimaryArtistEventCount: 6,
    });
    const previous = buildListeningPeriodMetrics({
      capturedPlayCount: 5,
      uniqueTrackCount: 3,
      uniqueArtistCount: 5,
      activeDayCount: 2,
      repeatedTrackEventCount: 0,
      topFiveTrackEventCount: 5,
      topFivePrimaryArtistEventCount: 5,
    });
    const shift = buildListeningShift(current, previous);
    expect(current).toEqual({
      capturedPlayCount: 10,
      uniqueTrackCount: 4,
      uniqueArtistCount: 7,
      activeDayCount: 3,
      repeatIntensity: 80,
      topTrackConcentration: 90,
      primaryArtistConcentration: 60,
    });
    expect(shift.comparisons.capturedPlayCount).toEqual({
      current: 10,
      previous: 5,
      delta: 5,
      percentageChange: 100,
    });
    expect(shift.comparisons.uniqueArtistCount.delta).toBe(2);
    expect(shift.comparisons.repeatIntensity.delta).toBe(80);
  });

  it('keeps empty-period percentages unavailable and never invents change from zero', () => {
    const empty = buildListeningPeriodMetrics({
      capturedPlayCount: 0,
      uniqueTrackCount: 0,
      uniqueArtistCount: 0,
      activeDayCount: 0,
      repeatedTrackEventCount: 0,
      topFiveTrackEventCount: 0,
      topFivePrimaryArtistEventCount: 0,
    });
    expect(empty.repeatIntensity).toBeNull();
    expect(compareMetric(8, 0)).toEqual({
      current: 8,
      previous: 0,
      delta: 8,
      percentageChange: null,
    });
  });
});

describe('captured movement ranking', () => {
  const item = (id: string, currentCapturedCount: number, previousCapturedCount: number) => ({
    id,
    currentCapturedCount,
    previousCapturedCount,
    delta: 999,
  });

  it('classifies entering, leaving, persistent rising, and persistent falling exactly', () => {
    const result = rankMovement(
      [
        item('enter', 1, 0),
        item('leave', 0, 1),
        item('rise', 4, 2),
        item('fall', 1, 3),
        item('stable', 2, 2),
        item('small-rise', 2, 1),
        item('small-fall', 1, 2),
      ],
      (candidate) => candidate.id,
    );
    expect(result.entering.map(({ id, delta }) => [id, delta])).toEqual([['enter', 1]]);
    expect(result.leaving.map(({ id, delta }) => [id, delta])).toEqual([['leave', -1]]);
    expect(result.increased.map(({ id }) => id)).toEqual(['rise']);
    expect(result.decreased.map(({ id }) => id)).toEqual(['fall']);
  });

  it('caps categories at five and resolves count ties by ID', () => {
    const result = rankMovement(
      ['f', 'e', 'd', 'c', 'b', 'a'].map((id) => item(id, 3, 0)),
      (candidate) => candidate.id,
    );
    expect(result.entering.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('orders increases and decreases by delta, relevant count, then ID', () => {
    const result = rankMovement(
      [
        item('inc-b', 6, 2),
        item('inc-a', 6, 2),
        item('inc-largest', 8, 2),
        item('dec-b', 1, 5),
        item('dec-a', 1, 5),
        item('dec-largest', 1, 7),
      ],
      (candidate) => candidate.id,
    );
    expect(result.increased.map(({ id }) => id)).toEqual(['inc-largest', 'inc-a', 'inc-b']);
    expect(result.decreased.map(({ id }) => id)).toEqual(['dec-largest', 'dec-a', 'dec-b']);
  });
});
