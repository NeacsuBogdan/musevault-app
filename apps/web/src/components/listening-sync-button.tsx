'use client';

import { useState } from 'react';

export function ListeningSyncButton({ hasHistory }: { hasHistory: boolean }) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function synchronize() {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      for (;;) {
        const response = await fetch('/api/spotify/listening/sync', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        const payload = (await response.json().catch(() => null)) as {
          status?: string;
          error?: { code?: string };
        } | null;
        if (!response.ok) throw new Error(payload?.error?.code ?? 'sync_failed');
        if (payload?.status !== 'running') break;
      }
      window.location.reload();
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message === 'authorization_required'
          ? 'Additional Spotify authorization is required.'
          : 'Spotify listening data is temporarily unavailable. Your recorded history is safe.',
      );
      setWorking(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => void synchronize()}
        disabled={working}
        className="rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-60"
      >
        {working
          ? 'Syncing listening data…'
          : hasHistory
            ? 'Sync listening data'
            : 'Start listening sync'}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-amber-200">
          {error}
        </p>
      ) : null}
    </div>
  );
}
