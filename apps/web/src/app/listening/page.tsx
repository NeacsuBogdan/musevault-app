import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, Music2 } from 'lucide-react';
import { redirect } from 'next/navigation';

import { ListeningSyncButton } from '@/components/listening-sync-button';
import { readSession } from '@/lib/auth/session';
import {
  getListeningInsights,
  type CurrentRotationTrack,
} from '@/lib/db/repositories/listening-intelligence';
import type { RecordedMomentumItem } from '@/lib/intelligence';

export const metadata: Metadata = {
  title: 'Listening',
  description: 'Explore listening intelligence grounded in events MuseVault has recorded.',
};
export const dynamic = 'force-dynamic';

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
  year: 'numeric',
});
const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'UTC',
});
const rangeLabel = {
  short_term: 'Short term',
  medium_term: 'Medium term',
  long_term: 'Long term',
} as const;

function formatDate(value: string | null): string {
  return value ? dateFormatter.format(new Date(value)) : 'Not available';
}

function formatPercentage(value: number | null): string {
  return value === null ? '—' : `${value}%`;
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

export default async function ListeningPage() {
  const session = await readSession();
  if (!session) redirect('/');
  const insights = await getListeningInsights(session.accountId);

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
            <Link href="/rediscover">Rediscover</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-caption font-semibold uppercase tracking-[0.18em] text-accent-green">
          LISTENING INTELLIGENCE
        </p>
        <h1 className="mt-3 text-page-title font-semibold">Listening</h1>
        <p className="mt-4 max-w-3xl text-body text-text-secondary">
          A view of recent rotation, repetition, and artist movement using only listening events
          MuseVault successfully recorded.
        </p>
        <aside className="mt-6 max-w-4xl rounded-card border border-border-subtle bg-surface p-4 text-body-sm text-text-secondary">
          <p>
            MuseVault does not have complete Spotify listening history. Coverage starts with the
            earliest captured event, manual-sync gaps may remain, and missing events stay unknown.
          </p>
        </aside>

        {insights.authorizationRequired ? (
          <section className="mt-10 rounded-panel border border-border-subtle bg-surface p-7">
            <h2 className="text-section-title font-semibold">Enable listening intelligence</h2>
            <p className="mt-3 text-text-secondary">
              Additional Spotify permission is required for Recently Played and Top Items. Your
              saved library and existing MuseVault data stay intact.
            </p>
            <a
              href="/api/auth/spotify/login"
              className="mt-6 inline-block rounded-control bg-accent-green px-5 py-2.5 font-semibold text-page"
            >
              Enable listening intelligence
            </a>
          </section>
        ) : (
          <>
            <section className="mt-10 flex flex-wrap items-end justify-between gap-5 rounded-panel border border-border-subtle bg-surface p-7">
              <div>
                <h2 className="text-section-title font-semibold">Listening synchronization</h2>
                <p className="mt-2 max-w-3xl text-body-sm text-text-secondary">
                  Manual, idempotent capture of the recent Spotify history currently available and
                  daily Spotify affinity rankings. This page never syncs automatically.
                </p>
              </div>
              <ListeningSyncButton hasHistory={insights.summary.totalRecordedPlays > 0} />
            </section>

            {insights.sync.status === 'running' ? (
              <p role="status" className="mt-6 text-accent-green">
                Listening sync is in progress · {insights.sync.processedPlayCount}{' '}
                MuseVault-recorded plays processed
              </p>
            ) : null}

            {insights.summary.totalRecordedPlays === 0 ? (
              <section className="mt-8 rounded-panel border border-dashed border-border-strong p-10 text-center">
                <h2 className="text-section-title font-semibold">
                  No MuseVault-recorded listening yet
                </h2>
                <p className="mt-2 text-text-secondary">
                  Start a sync to capture the recent history Spotify currently makes available.
                </p>
              </section>
            ) : (
              <>
                <ListeningPulse insights={insights} />
                <CurrentRotation tracks={insights.currentRotation} />
                <RecordedMomentumSection momentum={insights.momentum} />
                <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
                  <h2 className="text-section-title font-semibold">
                    Recent MuseVault-recorded plays
                  </h2>
                  <p className="mt-2 text-body-sm text-text-secondary">
                    The latest events in MuseVault&apos;s captured history, not total Spotify plays.
                  </p>
                  <ol className="mt-5 divide-y divide-border-subtle">
                    {insights.recentPlays.map((play) => (
                      <li
                        key={`${play.trackId}-${play.playedAt}`}
                        className="flex flex-wrap justify-between gap-2 py-3"
                      >
                        <span className="font-medium">{play.trackName}</span>
                        <time className="text-body-sm text-text-muted" dateTime={play.playedAt}>
                          {dateTimeFormatter.format(new Date(play.playedAt))} UTC
                        </time>
                      </li>
                    ))}
                  </ol>
                </section>
              </>
            )}

            {insights.affinity.length ? (
              <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
                <h2 className="text-section-title font-semibold">Captured Spotify affinity</h2>
                <p className="mt-2 text-body-sm text-text-secondary">
                  Spotify-calculated affinity ranks remain separate from Rotation Score and are
                  never presented as play counts.
                </p>
                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                  {insights.affinity.map((group) => (
                    <div key={group.timeRange}>
                      <h3 className="font-semibold text-accent-green">
                        {rangeLabel[group.timeRange]} affinity
                      </h3>
                      <p className="mt-3 text-caption uppercase text-text-muted">
                        Captured rank · artists
                      </p>
                      <AffinityList items={group.artists.slice(0, 5)} />
                      <p className="mt-4 text-caption uppercase text-text-muted">
                        Captured rank · tracks
                      </p>
                      <AffinityList items={group.tracks.slice(0, 5)} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

function ListeningPulse({
  insights,
}: {
  insights: Awaited<ReturnType<typeof getListeningInsights>>;
}) {
  const pulse = insights.pulse;
  const current30Available = pulse.current30.recordedPlayCount > 0;
  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
      <h2 className="text-section-title font-semibold">Listening Pulse</h2>
      <p className="mt-2 text-body-sm text-text-secondary">
        Factual activity inside the current half-open 7-day and 30-day MuseVault-recorded windows.
      </p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Recorded events · 7d" value={pulse.current7.recordedPlayCount} />
        <Metric label="Recorded events · 30d" value={pulse.current30.recordedPlayCount} />
        <Metric label="Unique tracks · 30d" value={pulse.current30.distinctTracks} />
        <Metric label="Unique credited artists · 30d" value={pulse.current30.distinctArtists} />
        <Metric label="Repeat intensity · 30d" value={formatPercentage(pulse.repeatIntensity)} />
        <Metric
          label="Top-track concentration · 30d"
          value={formatPercentage(pulse.topTrackConcentration)}
        />
        <Metric
          label="Top-artist concentration · 30d"
          value={formatPercentage(pulse.topArtistConcentration)}
        />
        <Metric label="Recorded coverage began" value={formatDate(pulse.coverageStartedAt)} />
        <Metric
          label="Last successful listening sync"
          value={formatDate(insights.freshness.latestSuccessfulListeningSyncAt)}
        />
      </div>
      <p className="mt-4 text-caption text-text-muted">
        Repeat intensity is the share of recorded events on tracks seen at least twice. Track and
        primary-artist concentration use the top five. Primary artist means credit position 0, so
        collaborations do not duplicate events.
      </p>
      {!current30Available ? (
        <p className="mt-3 text-body-sm text-text-secondary">
          No MuseVault-recorded events fall inside the current 30-day window; percentage metrics are
          unavailable rather than treated as 0%.
        </p>
      ) : null}
      {insights.freshness.state === 'stale_for_current7' ? (
        <div className="mt-4 rounded-card bg-surface-hover px-4 py-3 text-body-sm text-text-secondary">
          <p className="font-semibold text-text-primary">Listening data needs a refresh</p>
          <p className="mt-1">
            No successful listening sync was completed during the latest 7-day window.
          </p>
        </div>
      ) : insights.freshness.state === 'never_synced' ? (
        <p className="mt-4 text-body-sm text-text-secondary">
          No successful listening sync has been recorded yet.
        </p>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-card border border-border-subtle bg-page p-4">
      <p className="text-caption uppercase text-text-muted">{label}</p>
      <p className="mt-2 text-xl font-semibold">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function CurrentRotation({ tracks }: { tracks: CurrentRotationTrack[] }) {
  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
      <h2 className="text-section-title font-semibold">Current Rotation</h2>
      <p className="mt-2 max-w-3xl text-body-sm text-text-secondary">
        Tracks appearing most strongly in MuseVault&apos;s recent captured rotation. Rotation Score
        is a bounded recency-and-frequency measure, not Spotify popularity or a probability.
      </p>
      {tracks.length ? (
        <ol className="mt-6 grid gap-4 lg:grid-cols-2">
          {tracks.map((track) => (
            <RotationCard key={track.trackId} track={track} />
          ))}
        </ol>
      ) : (
        <div className="mt-6 rounded-card border border-dashed border-border-strong p-7 text-center">
          <h3 className="font-semibold">No current rotation</h3>
          <p className="mt-2 text-body-sm text-text-secondary">
            No MuseVault-recorded events fall inside the current 30-day window.
          </p>
        </div>
      )}
    </section>
  );
}

function RotationCard({ track }: { track: CurrentRotationTrack }) {
  const spotifyUrl = isSafeSpotifyTrackUrl(track.spotifyUrl) ? track.spotifyUrl : null;
  return (
    <li className="rounded-card border border-border-subtle bg-page p-5">
      <div className="flex gap-4">
        {isSafeSpotifyImage(track.albumImageUrl) ? (
          <Image
            src={track.albumImageUrl}
            alt={`Cover artwork for ${track.albumName}`}
            width={80}
            height={80}
            className="size-20 rounded-card object-cover"
          />
        ) : (
          <span
            role="img"
            aria-label={`No cover artwork for ${track.albumName}`}
            className="grid size-20 shrink-0 place-items-center rounded-card bg-surface-hover text-text-muted"
          >
            <Music2 aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="font-semibold">{track.trackName}</h3>
          <p className="mt-1 text-body-sm text-text-secondary">{track.artistNames.join(', ')}</p>
          <p className="mt-1 truncate text-caption text-text-muted">{track.albumName}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-border-subtle pt-4">
        <span className="rounded-pill bg-accent-green/10 px-3 py-1 text-caption font-semibold text-accent-green">
          Rotation Score {track.rotationScore}
        </span>
        <span className="rounded-pill bg-surface-hover px-3 py-1 text-caption capitalize text-text-secondary">
          Evidence Level: {track.evidenceLevel}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-body-sm">
        <div>
          <dt className="text-text-muted">MuseVault-recorded plays · 7d</dt>
          <dd className="mt-1 font-semibold">{track.current7RecordedCount}</dd>
        </div>
        <div>
          <dt className="text-text-muted">MuseVault-recorded plays · 30d</dt>
          <dd className="mt-1 font-semibold">{track.current30RecordedCount}</dd>
        </div>
      </dl>
      <p className="mt-3 text-caption text-text-muted">
        Latest MuseVault-recorded play:{' '}
        {dateTimeFormatter.format(new Date(track.latestRecordedPlayAt))} UTC
      </p>
      {track.explanation ? (
        <p className="mt-3 text-body-sm text-text-secondary">{track.explanation.text}</p>
      ) : null}
      {spotifyUrl ? (
        <a
          href={spotifyUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-body-sm font-semibold text-accent-green"
        >
          Open in Spotify <ExternalLink aria-hidden="true" size={14} />
        </a>
      ) : null}
    </li>
  );
}

function RecordedMomentumSection({
  momentum,
}: {
  momentum: Awaited<ReturnType<typeof getListeningInsights>>['momentum'];
}) {
  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
      <h2 className="text-section-title font-semibold">Recorded Momentum</h2>
      <p className="mt-2 text-body-sm text-text-secondary">
        Primary-artist presence in the latest 7 days compared with the previous equal 7-day window.
        MuseVault-recorded history may be incomplete.
      </p>
      {momentum.state === 'insufficient_coverage' ? (
        <div className="mt-6 rounded-card border border-dashed border-border-strong p-6">
          <h3 className="font-semibold">Not enough captured history yet</h3>
          <p className="mt-2 text-body-sm text-text-secondary">
            MuseVault needs at least 14 days of recorded coverage before presenting a two-week
            comparison. Missing Spotify events remain unknown.
          </p>
        </div>
      ) : momentum.state === 'stale_data' ? (
        <div className="mt-6 rounded-card border border-dashed border-border-strong p-6">
          <h3 className="font-semibold">
            Listening data has not been refreshed during the latest 7-day window
          </h3>
          <p className="mt-2 text-body-sm text-text-secondary">
            Sync listening data to compare the latest 7 days with the previous 7-day window.
          </p>
        </div>
      ) : momentum.increased.length === 0 && momentum.decreased.length === 0 ? (
        <div className="mt-6 rounded-card border border-dashed border-border-strong p-6">
          <h3 className="font-semibold">No qualifying recorded movement</h3>
          <p className="mt-2 text-body-sm text-text-secondary">
            No primary artist changed by at least two MuseVault-recorded plays between the two
            windows.
          </p>
        </div>
      ) : (
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <MomentumList
            title="More present in the latest 7 days"
            description="More MuseVault-recorded plays than in the previous 7-day window."
            items={momentum.increased}
          />
          <MomentumList
            title="Less present in the latest 7 days"
            description="Fewer MuseVault-recorded plays than in the previous 7-day window."
            items={momentum.decreased}
          />
        </div>
      )}
    </section>
  );
}

function MomentumList({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: RecordedMomentumItem[];
}) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-caption text-text-muted">{description}</p>
      {items.length ? (
        <ol className="mt-4 space-y-2">
          {items.map((item) => (
            <li
              key={item.artistId}
              className="flex items-center justify-between gap-3 rounded-card bg-page px-4 py-3"
            >
              <span className="font-medium">{item.artistName}</span>
              <span className="text-body-sm text-text-secondary">
                {item.previous7RecordedCount} → {item.current7RecordedCount} (
                {item.delta > 0 ? '+' : ''}
                {item.delta})
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-body-sm text-text-muted">No artists qualify in this direction.</p>
      )}
    </div>
  );
}

function AffinityList({ items }: { items: Array<{ id: string; name: string; rank: number }> }) {
  return (
    <ol className="mt-2 space-y-1 text-body-sm">
      {items.map((item) => (
        <li key={item.id}>
          {item.rank}. {item.name}
        </li>
      ))}
    </ol>
  );
}
