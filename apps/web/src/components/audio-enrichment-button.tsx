'use client';
import { useState } from 'react';
export function AudioEnrichmentButton({ hasCoverage }: { hasCoverage: boolean }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function enrich() {
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch('/api/audio-features/enrichment', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: { code?: string };
      } | null;
      if (!response.ok) {
        const code = payload?.error?.code;
        setMessage(
          code === 'rate_limited'
            ? 'ReccoBeats is rate limited. Your existing audio profile is safe; retry later.'
            : 'ReccoBeats is temporarily unavailable. Your existing audio profile is safe; retry later.',
        );
        return;
      }
      window.location.reload();
    } catch {
      setMessage(
        'ReccoBeats is temporarily unavailable. Your existing audio profile is safe; retry later.',
      );
    } finally {
      setWorking(false);
    }
  }
  return (
    <div>
      <button
        type="button"
        disabled={working}
        onClick={() => void enrich()}
        className="rounded-full bg-emerald-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-60"
      >
        {working ? 'Enriching…' : hasCoverage ? 'Enrich next batch' : 'Enrich audio features'}
      </button>
      {message ? (
        <p role="alert" className="mt-3 max-w-md text-sm text-amber-200">
          {message}
        </p>
      ) : null}
    </div>
  );
}
