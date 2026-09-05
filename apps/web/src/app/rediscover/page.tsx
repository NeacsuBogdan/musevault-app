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
    'Current recorded-listening and captured-affinity pressure lowered every eligible track to a zero score.',
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
          An intelligent, evidence-aware ranking of older tracks that may be worth surfacing again.
        </p>
        <aside className="mt-6 max-w-4xl rounded-card border border-border-subtle bg-surface p-4 text-body-sm text-text-secondary">
          <h2 className="font-semibold text-text-primary">How Rediscover works</h2>
          <p className="mt-2">
            Rediscover combines library age, MuseVault-recorded listening, and captured Spotify
            affinity, then applies deterministic diversity so one artist or album does not dominate
            the results.
          </p>
          <p className="mt-2">
            Rediscover Score measures surfacing relevance. Evidence Level reflects the mix of
            track-specific and contextual evidence. Diversity changes the final order without
            changing a track&apos;s raw score.
          </p>
          <p className="mt-2 text-text-muted">
            MuseVault does not have complete Spotify listening history. Missing recorded plays or
            affinity snapshots remain unknown and do not add relevance.
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-pill bg-accent-green/10 px-3 py-1 text-caption font-semibold text-accent-green">
            Rediscover Score {candidate.rediscoverScore}
          </span>
          <span className="rounded-pill bg-surface-hover px-3 py-1 text-caption capitalize text-text-secondary">
            Evidence Level: {candidate.evidenceLevel}
          </span>
        </div>
        {candidate.latestRecordedPlayAt ? (
          <p className="mt-3 text-caption text-text-muted">
            Latest MuseVault-recorded play:{' '}
            {dateFormatter.format(new Date(candidate.latestRecordedPlayAt))}
          </p>
        ) : null}
        <h3 className="mt-4 text-caption font-semibold uppercase tracking-[0.12em] text-text-muted">
          Why this track?
        </h3>
        <ul className="mt-2 flex flex-wrap gap-2">
          {candidate.explanationReasons.map((reason) => (
            <li
              key={reason.code}
              className="rounded-pill bg-surface-hover px-3 py-1 text-caption text-text-secondary"
            >
              {reason.text}
            </li>
          ))}
        </ul>
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
