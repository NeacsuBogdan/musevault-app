import { describe, expect, it } from 'vitest';

import { parsePersistedLibraryPagination } from './persisted-library';

describe('persisted library pagination', () => {
  it('accepts bounded pagination', () => {
    expect(parsePersistedLibraryPagination({ limit: 50, offset: 100 })).toEqual({
      limit: 50,
      offset: 100,
    });
  });

  it('rejects unbounded and malformed pagination', () => {
    expect(() => parsePersistedLibraryPagination({ limit: 101, offset: 0 })).toThrow();
    expect(() => parsePersistedLibraryPagination({ limit: 50, offset: -1 })).toThrow();
    expect(() => parsePersistedLibraryPagination({ limit: 50, offset: 0, secret: true })).toThrow();
  });
});
