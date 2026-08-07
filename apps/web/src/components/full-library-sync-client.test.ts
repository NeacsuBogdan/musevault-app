import { describe, expect, it, vi } from 'vitest';

import { runFullLibrarySync } from './full-library-sync-client';

describe('full library sync client loop', () => {
  it('steps repeatedly and publishes progress until completion', async () => {
    const step = vi
      .fn()
      .mockResolvedValueOnce({ status: 'running', count: 150 })
      .mockResolvedValueOnce({ status: 'completed', count: 200 });
    const onProgress = vi.fn();

    await expect(runFullLibrarySync(step, onProgress)).resolves.toEqual({
      status: 'completed',
      count: 200,
    });
    expect(step).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('stops immediately on a failed step without starting another request', async () => {
    const step = vi.fn().mockRejectedValue(new Error('rate limited'));

    await expect(runFullLibrarySync(step, vi.fn())).rejects.toThrow('rate limited');
    expect(step).toHaveBeenCalledOnce();
  });
});
