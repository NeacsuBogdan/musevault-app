import { describe, expect, it, vi } from 'vitest';

import { runFullLibrarySync, runIncrementalThenFullSync } from './full-library-sync-client';

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

describe('incremental client fallback', () => {
  it.each(['no_changes', 'applied'])('stops after incremental result %s', async (result) => {
    const fullStep = vi.fn();
    await runIncrementalThenFullSync(() => Promise.resolve({ result }), fullStep, vi.fn(), vi.fn());
    expect(fullStep).not.toHaveBeenCalled();
  });

  it('automatically transitions into the existing full loop', async () => {
    const fullStep = vi
      .fn()
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce({ status: 'completed' });
    await runIncrementalThenFullSync(
      () => Promise.resolve({ result: 'full_sync_required' }),
      fullStep,
      vi.fn(),
      vi.fn(),
    );
    expect(fullStep).toHaveBeenCalledTimes(2);
  });
});
