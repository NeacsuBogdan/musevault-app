import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const moodDistributionSource = readFileSync(
  new URL('./mood-distribution-card.tsx', import.meta.url),
  'utf8',
).replace(/\s+/g, ' ');
const libraryHealthSource = readFileSync(
  new URL('./library-health-card.tsx', import.meta.url),
  'utf8',
).replace(/\s+/g, ' ');

describe('dashboard preview copy', () => {
  it('states that mood analysis is unimplemented without requiring a full sync', () => {
    expect(moodDistributionSource).toContain('No mood values are calculated yet.');
    expect(moodDistributionSource).toContain(
      'Mood analysis will be implemented in a later milestone.',
    );
    expect(moodDistributionSource).not.toContain('requires full-library');
  });

  it('states that library health analysis is unimplemented without requiring a full sync', () => {
    expect(libraryHealthSource).toContain('No health score is calculated yet.');
    expect(libraryHealthSource).toContain(
      'Library-quality analysis will be implemented in a later milestone.',
    );
    expect(libraryHealthSource).not.toContain('require a persistent, full-library sync');
  });
});
