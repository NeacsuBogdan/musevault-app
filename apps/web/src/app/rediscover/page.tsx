import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, Music2 } from 'lucide-react';
import { redirect } from 'next/navigation';

import { readSession } from '@/lib/auth/session';
import {
  getRediscoverSnapshot,
  type RediscoverCandidate,
  type RediscoverState,
} from '@/lib/db/repositories/rediscover';

export const metadata: Metadata = {
  title: 'Rediscover',
  description: 'Older saved tracks surfaced from signals MuseVault can truthfully observe.',
};
export const dynamic = 'force-dynamic';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});

function isSafeSpotifyImage(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'i.scdn.co';
  } catch {
    return false;
  }
}

function isSafeSpotifyTrackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'open.spotify.com' &&
      url.pathname.startsWith('/track/')
    );
  } catch {
    return false;
  }
}

function rediscoverReasons(candidate: RediscoverCandidate, now = new Date()): string[] {
  const years = (now.getTime() - new Date(candidate.savedAt).getTime()) / (365 * 86_400_000);
  const age =
    years >= 5
      ? 'Saved 5+ years ago'
      : years >= 3
        ? 'Saved 3+ years ago'
        : years >= 2
          ? 'Saved 2+ years ago'
          : years >= 1
            ? 'Saved 1+ year ago'
            : `Saved ${dateFormatter.format(new Date(candidate.savedAt))}`;
  const reasons = [age];
  if (candidate.latestRecordedPlayAt) {
    reasons.push(
      `Latest MuseVault-recorded play: ${dateFormatter.format(new Date(candidate.latestRecordedPlayAt))}`,
    );
  } else {
    reasons.push('No play recorded by MuseVault yet');
  }
  if (candidate.affinity.mediumTerm) reasons.push('In medium-term Spotify affinity');
  if (candidate.affinity.longTerm) reasons.push('In long-term Spotify affinity');
  return reasons;
}

const emptyCopy: Record<Exclude<RediscoverState, 'success'>, [string, string]> = {
  sync_required: ['Library sync required', 'Complete a full library sync before using Rediscover.'],
  sync_in_progress: [
    'Library sync in progress',
    'Rediscover will be ready after the authoritative full sync finishes.',
  ],
  empty_library: ['Empty library', 'Your completed library snapshot contains no saved tracks.'],
  nothing_eligible: [
    'Nothing ready for Rediscover yet',
    'No current saved tracks have reached the 90-day minimum age.',
  ],
  no_candidates: [
    'No Rediscover candidates right now',
    'Eligible tracks all have positive current-activity signals. Check back after those signals change.',
  ],
};

export default async function RediscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const session = await readSession();
  if (!session) redirect('/');
  const params = await searchParams;
  const snapshot = await getRediscoverSnapshot(session.accountId, { page: params.page });

  return (
    <main className="min-h-screen bg-page text-text-primary">
      <header className="border-b border-border-subtle bg-sidebar">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/dashboard" className="font-semibold">
            MuseVault
          </Link>
          <nav className="flex gap-4 text-body-sm text-text-secondary">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/library">Library</Link>
            <Link href="/listening">Listening</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-caption font-semibold uppercase tracking-[0.18em] text-accent-green">
          REDISCOVER
        </p>
        <h1 className="mt-3 text-page-title font-semibold">Rediscover</h1>
        <p className="mt-4 max-w-3xl text-body text-text-secondary">
          Older tracks from your saved library, surfaced using signals MuseVault can actually
          observe.
        </p>
        <aside className="mt-6 max-w-4xl rounded-card border border-border-subtle bg-surface p-4 text-body-sm text-text-secondary">
          Candidates were saved at least 90 days ago and are ranked by saved age, MuseVault-recorded
          plays, and latest Spotify affinity snapshots. Tracks with a recorded play in the last 7
          days or latest short-term affinity are excluded.
          <p className="mt-2 text-text-muted">
            MuseVault only knows listening events it has recorded since listening synchronization
            began. Missing recorded plays are not treated as proof that a track was not played on
            Spotify.
          </p>
        </aside>

        {snapshot.state === 'success' ? (
          <>
            <section
              aria-label="Rediscover summary"
              className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <Summary
                label="Current saved library"
                value={snapshot.summary.currentSavedTrackCount}
              />
              <Summary
                label="Older saved tracks eligible"
                value={snapshot.summary.eligibleTrackCount}
              />
              <Summary label="Rediscover candidates" value={snapshot.summary.candidateCount} />
              <Summary
                label="Recorded coverage began"
                value={
                  snapshot.recordedCoverage.startedAt
                    ? dateFormatter.format(new Date(snapshot.recordedCoverage.startedAt))
                    : 'Not available'
                }
              />
            </section>
            {snapshot.candidates.length ? (
              <ol className="mt-8 grid gap-5 md:grid-cols-2">
                {snapshot.candidates.map((candidate) => (
                  <CandidateCard key={candidate.trackId} candidate={candidate} />
                ))}
              </ol>
            ) : (
              <section className="mt-8 rounded-panel border border-dashed border-border-strong p-10 text-center">
                <h2 className="text-section-title font-semibold">This page has no candidates</h2>
                <p className="mt-2 text-text-secondary">
                  Use Previous to return to an available results page.
                </p>
              </section>
            )}
            <Pagination
              page={snapshot.pagination.page}
              totalPages={snapshot.pagination.totalPages}
            />
          </>
        ) : (
          <section className="mt-10 rounded-panel border border-dashed border-border-strong p-10 text-center">
            <h2 className="text-section-title font-semibold">{emptyCopy[snapshot.state][0]}</h2>
            <p className="mt-2 text-body text-text-secondary">{emptyCopy[snapshot.state][1]}</p>
            {snapshot.state === 'sync_required' ? (
              <Link
                href="/library"
                className="mt-5 inline-block text-body-sm font-semibold text-accent-green"
              >
                Open Library
              </Link>
            ) : null}
          </section>
        )}
      </div>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-card border border-border-subtle bg-surface p-4">
      <p className="text-caption uppercase text-text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: RediscoverCandidate }) {
  const spotifyUrl = isSafeSpotifyTrackUrl(candidate.spotifyUrl) ? candidate.spotifyUrl : null;
  return (
    <li className="rounded-panel border border-border-subtle bg-surface p-5 shadow-card">
      <div className="flex gap-4">
        {isSafeSpotifyImage(candidate.albumImageUrl) ? (
          <Image
            src={candidate.albumImageUrl}
            alt={`Cover artwork for ${candidate.albumName}`}
            width={96}
            height={96}
            className="size-24 rounded-card object-cover"
          />
        ) : (
          <span
            role="img"
            aria-label={`No cover artwork for ${candidate.albumName}`}
            className="grid size-24 shrink-0 place-items-center rounded-card bg-surface-hover text-text-muted"
          >
            <Music2 aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-card-title font-semibold">{candidate.trackName}</h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            {candidate.artistNames.join(', ')}
          </p>
          <p className="mt-1 text-caption text-text-muted">{candidate.albumName}</p>
          <time
            dateTime={candidate.savedAt}
            className="mt-3 block text-caption text-text-secondary"
          >
            Saved {dateFormatter.format(new Date(candidate.savedAt))}
          </time>
        </div>
      </div>
      <div className="mt-5 border-t border-border-subtle pt-4">
        <h3 className="text-caption font-semibold uppercase tracking-[0.12em] text-text-muted">
          Why this track?
        </h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {rediscoverReasons(candidate).map((reason) => (
            <li
              key={reason}
              className="rounded-pill bg-surface-hover px-3 py-1 text-caption text-text-secondary"
            >
              {reason}
            </li>
          ))}
        </ul>
        {!candidate.latestRecordedPlayAt ? (
          <p className="mt-2 text-caption text-text-muted">
            This only refers to MuseVault&apos;s recorded listening history.
          </p>
        ) : null}
      </div>
      {spotifyUrl ? (
        <a
          href={spotifyUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex items-center gap-2 text-body-sm font-semibold text-accent-green"
        >
          Open in Spotify <ExternalLink aria-hidden="true" size={14} />
        </a>
      ) : null}
    </li>
  );
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  return (
    <nav
      aria-label="Rediscover pages"
      className="mt-8 flex items-center justify-between border-t border-border-subtle pt-5"
    >
      <span className="text-body-sm text-text-muted">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-3">
        {page > 1 ? (
          <Link
            href={`/rediscover?page=${page - 1}`}
            className="rounded-control border border-border-strong px-4 py-2 text-body-sm font-semibold"
          >
            Previous
          </Link>
        ) : null}
        {page < totalPages ? (
          <Link
            href={`/rediscover?page=${page + 1}`}
            className="rounded-control bg-accent-green px-4 py-2 text-body-sm font-semibold text-page"
          >
            Next
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
