import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const analyticsSource = readFileSync(new URL('./dashboard-analytics.tsx', import.meta.url), 'utf8');
const factsSource = readFileSync(new URL('./library-facts-card.tsx', import.meta.url), 'utf8');
const rediscoverSource = readFileSync(new URL('./rediscover-section.tsx', import.meta.url), 'utf8');

describe('dashboard analytics copy', () => {
  it('labels analytics as synchronized snapshot data without preview or mood claims', () => {
    expect(analyticsSource).toContain('Calculated from your latest synchronized library snapshot.');
    expect(analyticsSource).not.toContain('Future library analytics');
    expect(analyticsSource).not.toContain('Product preview');
    expect(analyticsSource).not.toContain('Mood Distribution');
  });

  it('replaces the health preview with truthful current-library facts', () => {
    expect(factsSource).toContain('Earliest save in current library');
    expect(factsSource).toContain('Latest save in current library');
    expect(factsSource).not.toContain('health score');
  });

  it('keeps Rediscover clearly presented as a preview', () => {
    expect(rediscoverSource).toContain('Product preview');
    expect(rediscoverSource).toContain('not generated from your Spotify data');
  });
});
