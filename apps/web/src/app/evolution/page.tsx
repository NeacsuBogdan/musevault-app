import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Activity, Disc3, Music2 } from 'lucide-react';
import { redirect } from 'next/navigation';

import { readSession } from '@/lib/auth/session';
import type {
  ArtistMovementItem,
  CurrentLibraryAdditions,
  EvolutionUnavailableReason,
  MetricComparison,
  MovementLists,
  MusicEvolutionSnapshot,
  SoundEvolution,
  TrackMovementItem,
} from '@/lib/music-evolution/contracts';
import { EVOLUTION_PERIOD_DAYS } from '@/lib/music-evolution/contracts';
import { parseEvolutionPeriod } from '@/lib/music-evolution/periods';
import { getMusicEvolution } from '@/lib/music-evolution/service';

import {
  getComparisonBadgePresentation,
  getListeningDeltaPresentation,
  getMovementDeltaPresentation,
} from './presentation';

export const metadata: Metadata = {
  title: 'Music Evolution',
  description: 'Compare equal rolling periods using listening history MuseVault captured.',
};
export const dynamic = 'force-dynamic';

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});

const featureLabels = {
  acousticness: 'Acousticness',
  danceability: 'Danceability',
  energy: 'Energy',
  instrumentalness: 'Instrumentalness',
  liveness: 'Liveness',
  speechiness: 'Speechiness',
  valence: 'Valence',
} as const;

const unavailableCopy: Record<EvolutionUnavailableReason, [string, string]> = {
  NO_CAPTURED_HISTORY: [
    'No captured listening history yet',
    'Complete a listening sync before comparing rolling periods.',
  ],
  NO_SUCCESSFUL_SYNC: [
    'No successful listening sync yet',
    'A completed listening sync is required before MuseVault can assess freshness.',
  ],
  INSUFFICIENT_HISTORY_SPAN: [
    'This comparison needs more captured history',
    'MuseVault has not yet captured the complete pair of equal rolling periods.',
  ],
  STALE_LISTENING_DATA: [
    'Captured listening needs a refresh',
    'The latest successful listening sync is older than seven days.',
  ],
  NO_EVENTS_IN_COMPARISON: [
    'No events in either captured period',
    'Neither rolling period contains captured listening events to compare.',
  ],
};

const soundReasonCopy: Record<
  Exclude<SoundEvolution['reasons'][number], 'COMPARISON_UNAVAILABLE'>,
  string
> = {
  CURRENT_TOO_FEW_COVERED_EVENTS: 'The current period has fewer than 20 covered captured events.',
  PREVIOUS_TOO_FEW_COVERED_EVENTS: 'The previous period has fewer than 20 covered captured events.',
  CURRENT_TOO_FEW_COVERED_TRACKS:
    'The current period has fewer than 10 covered unique captured tracks.',
  PREVIOUS_TOO_FEW_COVERED_TRACKS:
    'The previous period has fewer than 10 covered unique captured tracks.',
  CURRENT_TOO_FEW_ACTIVE_DAYS:
    'The current period has fewer than 3 active captured-listening days.',
  PREVIOUS_TOO_FEW_ACTIVE_DAYS:
    'The previous period has fewer than 3 active captured-listening days.',
  CURRENT_EVENT_COVERAGE_TOO_LOW:
    'The current period has less than 50% event-weighted audio coverage.',
  PREVIOUS_EVENT_COVERAGE_TOO_LOW:
    'The previous period has less than 50% event-weighted audio coverage.',
};

function formatDateTime(value: Date | null): string {
  return value ? `${dateTimeFormatter.format(value)} UTC` : 'Not available';
}

function formatRange(start: Date, end: Date): string {
  return `${dateTimeFormatter.format(start)} – ${dateTimeFormatter.format(end)} UTC`;
}

function formatPercentage(value: number | null): string {
  return value === null ? 'Unavailable' : `${Number(value.toFixed(1))}%`;
}

function isSafeSpotifyImage(value: string | null): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'i.scdn.co';
  } catch {
    return false;
  }
}

export default async function EvolutionPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const session = await readSession();
  if (!session) redirect('/');
  const params = await searchParams;
  const periodDays = parseEvolutionPeriod(params.period);
  const snapshot = await getMusicEvolution(session.accountId, periodDays);

  return (
    <main className="min-h-screen bg-page text-text-primary">
      <header className="border-b border-border-subtle bg-sidebar">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/dashboard" className="font-semibold">
            MuseVault
          </Link>
          <nav className="flex gap-4 text-body-sm text-text-secondary">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/listening">Listening</Link>
            <Link href="/audio-profile">Audio Profile</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-caption font-semibold uppercase tracking-[0.18em] text-accent-green">
          HISTORICAL INTELLIGENCE
        </p>
        <h1 className="mt-3 text-page-title font-semibold">Music Evolution</h1>
        <p className="mt-4 max-w-3xl text-body text-text-secondary">
          Compare how your captured listening changed between two equal rolling periods.
        </p>
        <aside className="mt-6 max-w-4xl rounded-card border border-border-subtle bg-surface p-4 text-body-sm text-text-secondary">
          MuseVault compares captured listening, not your complete Spotify listening history.
          Manual-sync gaps may remain, and missing events stay unknown.
        </aside>

        <PeriodSelector selected={periodDays} />
        <ComparisonHeader snapshot={snapshot} />

        {snapshot.availability.available && snapshot.listeningShift ? (
          <>
            <ListeningShiftSection shift={snapshot.listeningShift} />
            {snapshot.rotationMovement ? (
              <TrackMovementSection movement={snapshot.rotationMovement} />
            ) : null}
            {snapshot.artistMovement ? (
              <ArtistMovementSection movement={snapshot.artistMovement} />
            ) : null}
          </>
        ) : (
          <UnavailableComparison snapshot={snapshot} />
        )}

        <CurrentLibraryAdditionsSection additions={snapshot.currentLibraryAdditions} />
        <SoundEvolutionSection sound={snapshot.soundEvolution} />
        <EvidenceDisclosure snapshot={snapshot} />
      </div>
    </main>
  );
}

function PeriodSelector({ selected }: { selected: number }) {
  return (
    <nav aria-label="Evolution period" className="mt-8 flex flex-wrap gap-2">
      {EVOLUTION_PERIOD_DAYS.map((period) => (
        <Link
          key={period}
          href={`/evolution?period=${period}`}
          aria-current={selected === period ? 'page' : undefined}
          className={
            selected === period
              ? 'rounded-pill bg-accent-green px-4 py-2 text-body-sm font-semibold text-page'
              : 'rounded-pill border border-border-strong bg-surface px-4 py-2 text-body-sm font-semibold text-text-secondary hover:text-text-primary'
          }
        >
          {period} days
        </Link>
      ))}
    </nav>
  );
}

function ComparisonHeader({ snapshot }: { snapshot: MusicEvolutionSnapshot }) {
  const badge =
    snapshot.availability.available && snapshot.evidenceLevel
      ? getComparisonBadgePresentation({
          available: true,
          evidenceLevel: snapshot.evidenceLevel,
        })
      : getComparisonBadgePresentation({ available: false });
  return (
    <section className="mt-6 rounded-panel border border-border-subtle bg-surface p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-caption font-semibold uppercase tracking-[0.12em] text-text-muted">
            {snapshot.period.periodDays}-day rolling comparison
          </p>
          <h2 className="mt-2 text-section-title font-semibold">
            Current period vs previous period
          </h2>
        </div>
        <span className={`rounded-pill px-3 py-1.5 text-caption font-semibold ${badge.className}`}>
          {badge.text}
        </span>
      </div>
      <dl className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-card bg-page p-4">
          <dt className="text-caption uppercase text-text-muted">Current</dt>
          <dd className="mt-2 text-body-sm">
            {formatRange(snapshot.period.current.start, snapshot.period.current.end)}
          </dd>
        </div>
        <div className="rounded-card bg-page p-4">
          <dt className="text-caption uppercase text-text-muted">Previous</dt>
          <dd className="mt-2 text-body-sm">
            {formatRange(snapshot.period.previous.start, snapshot.period.previous.end)}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-caption text-text-muted">
        Latest successful listening sync:{' '}
        {formatDateTime(snapshot.history.latestSuccessfulListeningSyncAt)}
      </p>
    </section>
  );
}

function UnavailableComparison({ snapshot }: { snapshot: MusicEvolutionSnapshot }) {
  if (snapshot.availability.available) return null;
  const [title, body] = unavailableCopy[snapshot.availability.reason];
  return (
    <section className="mt-8 rounded-panel border border-dashed border-border-strong p-9 text-center">
      <Activity aria-hidden="true" className="mx-auto text-text-muted" />
      <h2 className="mt-4 text-section-title font-semibold">{title}</h2>
      <p className="mx-auto mt-2 max-w-2xl text-body-sm text-text-secondary">{body}</p>
      <p className="mx-auto mt-2 max-w-2xl text-caption text-text-muted">
        This period remains selectable and will become available naturally as captured history grows
        and listening data stays fresh.
      </p>
    </section>
  );
}

function ListeningShiftSection({
  shift,
}: {
  shift: NonNullable<MusicEvolutionSnapshot['listeningShift']>;
}) {
  const metrics = [
    ['Captured plays', shift.comparisons.capturedPlayCount, false],
    ['Unique tracks', shift.comparisons.uniqueTrackCount, false],
    ['Unique credited artists', shift.comparisons.uniqueArtistCount, false],
    ['Active captured-listening days', shift.comparisons.activeDayCount, false],
    ['Repeat intensity', shift.comparisons.repeatIntensity, true],
    ['Top-five track concentration', shift.comparisons.topTrackConcentration, true],
    ['Primary-artist concentration', shift.comparisons.primaryArtistConcentration, true],
  ] as const;

  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
      <h2 className="text-section-title font-semibold">Listening Shift</h2>
      <p className="mt-2 text-body-sm text-text-secondary">
        Separate factual measures from the two captured-listening periods. Direction is not a
        quality judgment.
      </p>
      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {metrics.map(([label, comparison, percentage]) => (
          <ListeningMetric
            key={label}
            label={label}
            comparison={comparison}
            percentage={percentage}
          />
        ))}
      </div>
    </section>
  );
}

function ListeningMetric({
  label,
  comparison,
  percentage,
}: {
  label: string;
  comparison: MetricComparison;
  percentage: boolean;
}) {
  const delta = getListeningDeltaPresentation(comparison, percentage);
  return (
    <div className="rounded-card border border-border-subtle bg-page p-4">
      <p className="text-caption uppercase text-text-muted">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-caption text-text-muted">Previous → Current</p>
          <p className="mt-1 font-semibold">
            {percentage ? formatPercentage(comparison.previous) : comparison.previous} →{' '}
            {percentage ? formatPercentage(comparison.current) : comparison.current}
          </p>
        </div>
        <span className={`text-body-sm font-semibold ${delta.className}`}>{delta.text}</span>
      </div>
    </div>
  );
}

function TrackMovementSection({ movement }: { movement: MovementLists<TrackMovementItem> }) {
  return (
    <MovementSection
      title="Rotation Movement"
      description="Track presence in captured rotation only."
    >
      <TrackMovementList title="Entered captured rotation" items={movement.entering} />
      <TrackMovementList title="Increased in captured rotation" items={movement.increased} />
      <TrackMovementList title="Decreased in captured rotation" items={movement.decreased} />
      <TrackMovementList
        title="Appeared only in the previous captured period"
        items={movement.leaving}
      />
    </MovementSection>
  );
}

function ArtistMovementSection({ movement }: { movement: MovementLists<ArtistMovementItem> }) {
  return (
    <MovementSection
      title="Artist Movement"
      description="Primary-artist event counts in captured listening, separate from Spotify affinity."
    >
      <ArtistMovementList title="Entered captured rotation" items={movement.entering} />
      <ArtistMovementList title="Increased in captured rotation" items={movement.increased} />
      <ArtistMovementList title="Decreased in captured rotation" items={movement.decreased} />
      <ArtistMovementList
        title="Appeared only in the previous captured period"
        items={movement.leaving}
      />
    </MovementSection>
  );
}

function MovementSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
      <h2 className="text-section-title font-semibold">{title}</h2>
      <p className="mt-2 text-body-sm text-text-secondary">{description}</p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">{children}</div>
    </section>
  );
}

function TrackMovementList({ title, items }: { title: string; items: TrackMovementItem[] }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      {items.length ? (
        <ol className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.trackId} className="flex items-center gap-3 rounded-card bg-page p-3">
              {isSafeSpotifyImage(item.albumImageUrl) ? (
                <Image
                  src={item.albumImageUrl}
                  alt=""
                  width={44}
                  height={44}
                  className="size-11 rounded-control object-cover"
                />
              ) : (
                <span className="grid size-11 shrink-0 place-items-center rounded-control bg-surface-hover text-text-muted">
                  <Music2 aria-hidden="true" size={17} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.trackName}</p>
                <p className="truncate text-caption text-text-muted">
                  {item.primaryArtistName ?? 'Artist unavailable'}
                </p>
              </div>
              <MovementCounts item={item} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-body-sm text-text-muted">No tracks qualify in this category.</p>
      )}
    </div>
  );
}

function ArtistMovementList({ title, items }: { title: string; items: ArtistMovementItem[] }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      {items.length ? (
        <ol className="mt-3 space-y-2">
          {items.map((item) => (
            <li
              key={item.artistId}
              className="flex items-center justify-between gap-3 rounded-card bg-page px-4 py-3"
            >
              <span className="font-medium">{item.artistName}</span>
              <MovementCounts item={item} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-body-sm text-text-muted">No artists qualify in this category.</p>
      )}
    </div>
  );
}

function MovementCounts({
  item,
}: {
  item: {
    currentCapturedCount: number;
    previousCapturedCount: number;
    delta: number;
  };
}) {
  const delta = getMovementDeltaPresentation(item.delta);
  return (
    <span className="shrink-0 text-right text-body-sm text-text-secondary">
      {item.previousCapturedCount} → {item.currentCapturedCount}
      <span className={`ml-2 font-semibold ${delta.className}`}>{delta.text}</span>
    </span>
  );
}

function CurrentLibraryAdditionsSection({ additions }: { additions: CurrentLibraryAdditions }) {
  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
      <h2 className="text-section-title font-semibold">
        Currently saved tracks added in this period
      </h2>
      <p className="mt-2 text-body-sm text-text-secondary">{additions.disclosure}</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <LibraryAdditionPeriod title="Current period" period={additions.current} />
        <LibraryAdditionPeriod title="Previous period" period={additions.previous} />
      </div>
    </section>
  );
}

function LibraryAdditionPeriod({
  title,
  period,
}: {
  title: string;
  period: CurrentLibraryAdditions['current'];
}) {
  return (
    <div className="rounded-card bg-page p-5">
      <p className="text-caption uppercase text-text-muted">{title}</p>
      <p className="mt-2 text-2xl font-semibold">{period.count.toLocaleString()}</p>
      {period.examples.length ? (
        <ol className="mt-4 space-y-2 border-t border-border-subtle pt-4">
          {period.examples.map((track) => (
            <li key={track.trackId} className="text-body-sm">
              <p className="font-medium">{track.trackName}</p>
              <p className="text-caption text-text-muted">
                {track.primaryArtistName ?? 'Artist unavailable'} · {formatDateTime(track.savedAt)}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-body-sm text-text-muted">
          No current saved memberships have saved timestamps in this period.
        </p>
      )}
    </div>
  );
}

function SoundEvolutionSection({ sound }: { sound: SoundEvolution }) {
  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-control bg-accent-purple/10 text-accent-purple">
          <Disc3 aria-hidden="true" size={18} />
        </span>
        <div>
          <h2 className="text-section-title font-semibold">Sound Evolution</h2>
          <p className="mt-1 text-body-sm text-text-secondary">
            Play-weighted Captured Listening Sound Centers using complete cached audio measurements.
          </p>
        </div>
      </div>

      {!sound.available ? (
        <div className="mt-6 rounded-card border border-dashed border-border-strong p-6">
          <h3 className="font-semibold">Sound comparison unavailable</h3>
          {sound.reasons.includes('COMPARISON_UNAVAILABLE') ? (
            <p className="mt-2 text-body-sm text-text-secondary">
              The captured-listening comparison must be available before sound movement can be
              calculated.
            </p>
          ) : (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-body-sm text-text-secondary">
              {sound.reasons.map((reason) => (
                <li key={reason}>
                  {reason === 'COMPARISON_UNAVAILABLE' ? '' : soundReasonCopy[reason]}
                </li>
              ))}
            </ul>
          )}
          {sound.current && sound.previous ? (
            <SoundEvidence current={sound.current} previous={sound.previous} />
          ) : null}
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="rounded-card bg-page p-5">
              <p className="text-caption uppercase text-text-muted">Sound Movement</p>
              <p className="mt-2 text-3xl font-semibold">{sound.movement}</p>
              <p className="mt-2 text-caption text-text-muted">
                Equal-weight RMS distance across seven bounded dimensions · 0–100
              </p>
            </div>
            <div className="rounded-card bg-page p-5">
              <h3 className="font-semibold">Strongest factual dimension shifts</h3>
              <ul className="mt-3 space-y-2 text-body-sm">
                {sound.strongestShifts.map((shift) => (
                  <li key={shift.feature} className="flex justify-between gap-3">
                    <span>
                      {featureLabels[shift.feature]} {shift.direction}
                    </span>
                    <span className="text-text-secondary">
                      {shift.previous.toFixed(3)} → {shift.current.toFixed(3)} (
                      {shift.delta > 0 ? '+' : ''}
                      {shift.delta.toFixed(3)})
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <SoundEvidence current={sound.current} previous={sound.previous} />
        </>
      )}
      <p className="mt-4 text-caption text-text-muted">
        Acousticness, danceability, energy, instrumentalness, liveness, speechiness, and valence are
        measured directly. Tempo and loudness are excluded; no mood is inferred.
      </p>
    </section>
  );
}

function SoundEvidence({
  current,
  previous,
}: {
  current: NonNullable<SoundEvolution['current']>;
  previous: NonNullable<SoundEvolution['previous']>;
}) {
  return (
    <dl className="mt-5 grid gap-3 md:grid-cols-2">
      {[
        ['Current audio evidence', current],
        ['Previous audio evidence', previous],
      ].map(([label, evidence]) => {
        const typed = evidence as typeof current;
        return (
          <div key={label as string} className="rounded-card bg-page p-4">
            <dt className="text-caption uppercase text-text-muted">{label as string}</dt>
            <dd className="mt-2 text-body-sm text-text-secondary">
              {typed.coveredCapturedEvents}/{typed.totalCapturedEvents} events (
              {formatPercentage(typed.eventCoveragePercentage)}) ·{' '}
              {typed.coveredUniqueCapturedTracks}/{typed.totalUniqueCapturedTracks} unique tracks (
              {formatPercentage(typed.uniqueTrackCoveragePercentage)}) ·{' '}
              {typed.activeCapturedListeningDays} active days
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function EvidenceDisclosure({ snapshot }: { snapshot: MusicEvolutionSnapshot }) {
  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-sidebar p-7">
      <h2 className="font-semibold">Evidence and captured-history coverage</h2>
      <dl className="mt-4 grid gap-4 text-body-sm sm:grid-cols-3">
        <div>
          <dt className="text-text-muted">Captured history began</dt>
          <dd className="mt-1 font-medium">
            {formatDateTime(snapshot.history.capturedHistoryStartedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Latest captured play</dt>
          <dd className="mt-1 font-medium">
            {formatDateTime(snapshot.history.latestCapturedPlayAt)}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Latest successful listening sync</dt>
          <dd className="mt-1 font-medium">
            {formatDateTime(snapshot.history.latestSuccessfulListeningSyncAt)}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-caption text-text-muted">
        Evidence Level describes how much captured data supports this comparison. It never changes
        metric values, directions, deltas, or rankings. Longer periods become available as MuseVault
        accumulates enough captured history.
      </p>
    </section>
  );
}
