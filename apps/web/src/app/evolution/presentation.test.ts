import { describe, expect, it } from 'vitest';

import {
  getComparisonBadgePresentation,
  getListeningDeltaPresentation,
  getMovementDeltaPresentation,
} from './presentation';

describe('Music Evolution presentation semantics', () => {
  it('renders an available comparison as a real Evidence Level badge', () => {
    expect(
      getComparisonBadgePresentation({ available: true, evidenceLevel: 'MEDIUM' }),
    ).toMatchObject({
      text: 'Evidence Level: MEDIUM',
      tone: 'evidence',
    });
  });

  it('renders an unavailable comparison as neutral status, not an Evidence Level', () => {
    const badge = getComparisonBadgePresentation({ available: false });
    expect(badge).toMatchObject({ text: 'Comparison unavailable', tone: 'neutral' });
    expect(badge.text).not.toBe('Evidence Level: Unavailable');
    expect(badge.className).not.toMatch(/green|red|success|danger/i);
  });

  it('keeps positive and negative listening deltas signed and semantically neutral', () => {
    const positive = getListeningDeltaPresentation(
      { current: 90, previous: 23, delta: 67, percentageChange: null },
      true,
    );
    const negative = getListeningDeltaPresentation({
      current: 21,
      previous: 40,
      delta: -19,
      percentageChange: -47.5,
    });
    expect(positive).toMatchObject({ text: '+67 pts', tone: 'neutral' });
    expect(negative).toMatchObject({ text: '-19', tone: 'neutral' });
    expect(`${positive.className} ${negative.className}`).not.toMatch(/green|red|success|danger/i);
  });

  it('keeps rotation and artist movement signs neutral through their shared presentation', () => {
    const rising = getMovementDeltaPresentation(17);
    const leaving = getMovementDeltaPresentation(-14);
    expect(rising).toMatchObject({ text: '+17', tone: 'neutral' });
    expect(leaving).toMatchObject({ text: '-14', tone: 'neutral' });
    expect(`${rising.className} ${leaving.className}`).not.toMatch(/green|red|success|danger/i);
  });
});
