export async function runFullLibrarySync<T extends { status: string }>(
  step: () => Promise<T>,
  onProgress: (state: T) => void,
): Promise<T> {
  for (;;) {
    const state = await step();
    onProgress(state);

    if (state.status === 'completed') return state;
    if (state.status !== 'running') throw new Error('Full library synchronization stopped.');
  }
}

export async function runIncrementalThenFullSync<
  I extends { result: string },
  F extends { status: string },
>(
  incremental: () => Promise<I>,
  fullStep: () => Promise<F>,
  onIncremental: (state: I) => void,
  onFullProgress: (state: F) => void,
): Promise<I | F> {
  const state = await incremental();
  onIncremental(state);
  if (state.result !== 'full_sync_required') return state;
  return runFullLibrarySync(fullStep, onFullProgress);
}
