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
