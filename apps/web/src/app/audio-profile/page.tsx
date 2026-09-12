import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, Music2 } from 'lucide-react';
import { redirect } from 'next/navigation';

import { AudioEnrichmentButton } from '@/components/audio-enrichment-button';
import { readSession } from '@/lib/auth/session';
import {
  getAudioProfileSummary,
  resolveAudioProfileUser,
  type SoundProfileTrack,
} from '@/lib/db/repositories/audio-profile';
import type { BoundedSoundFeature, SoundCenter, SoundDistribution } from '@/lib/intelligence';

export const metadata: Metadata = {
  title: 'Audio Profile',
  description: 'Coverage-aware sound intelligence for your current saved library.',
};
export const dynamic = 'force-dynamic';

const featureLabels: Record<BoundedSoundFeature, string> = {
  acousticness: 'Acousticness',
  danceability: 'Danceability',
  energy: 'Energy',
  instrumentalness: 'Instrumentalness',
  liveness: 'Liveness',
  speechiness: 'Speechiness',
  valence: 'Valence',
};
const boundedFeatureOrder = Object.keys(featureLabels) as BoundedSoundFeature[];
const qualityLabels = { LOW: 'Low coverage', MEDIUM: 'Medium coverage', HIGH: 'High coverage' };

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`;
}

function formatBounded(value: number | null): string {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}

function formatNative(value: number | null, unit: string): string {
  if (value === null) return '—';
  return `${Number(value.toFixed(1)).toLocaleString('en-US', { maximumFractionDigits: 1 })} ${unit}`;
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

export default async function AudioProfilePage() {
  const session = await readSession();
  if (!session) redirect('/');
  const userId = await resolveAudioProfileUser(session.accountId);
  if (!userId) redirect('/library');
  const profile = await getAudioProfileSummary(userId);
  const { coverage } = profile;

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
          SOUND INTELLIGENCE
        </p>
        <h1 className="mt-3 text-page-title font-semibold">Audio Profile</h1>
        <p className="mt-4 max-w-3xl text-body text-text-secondary">
          A median-led view of audio characteristics in the enriched portion of your current saved
          library. It describes cached audio measurements; it does not infer mood, genre, or
          listening behavior.
        </p>
        <aside className="mt-6 max-w-4xl rounded-card border border-border-subtle bg-surface p-4 text-body-sm text-text-secondary">
          ReccoBeats supplies these derived audio characteristics. Only when you choose enrichment
          are Spotify track identifiers sent for lookup. No Spotify token is sent, and ReccoBeats
          currently requires no API key.
        </aside>

        <section className="mt-10 flex flex-wrap items-end justify-between gap-6 rounded-panel border border-border-subtle bg-surface p-7">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-section-title font-semibold">Current saved-library coverage</h2>
              <span className="rounded-full border border-border-strong px-3 py-1 text-caption font-semibold uppercase tracking-wide text-text-secondary">
                {qualityLabels[coverage.coverageQuality]}
              </span>
            </div>
            <p className="mt-3 text-lg font-semibold">
              {coverage.audioCoveredTrackCount.toLocaleString()} of{' '}
              {coverage.currentSavedTrackCount.toLocaleString()} saved tracks ·{' '}
              {formatPercent(coverage.audioCoveragePercent)}
            </p>
            <p className="mt-2 max-w-3xl text-body-sm text-text-secondary">
              Coverage includes only tracks currently saved in your library with cached, available
              ReccoBeats features. Removed or otherwise stale cached tracks are excluded.
            </p>
          </div>
          {coverage.currentSavedTrackCount > 0 ? (
            <AudioEnrichmentButton hasCoverage={coverage.audioCoveredTrackCount > 0} />
          ) : null}
        </section>

        {profile.lastRun?.status === 'failed' ? (
          <p
            role="status"
            className="mt-5 rounded-card border border-amber-300/30 bg-surface p-4 text-body-sm text-amber-200"
          >
            The latest explicit enrichment attempt did not complete. Existing cached audio features
            remain available; retry later.
          </p>
        ) : null}

        {coverage.currentSavedTrackCount === 0 ? (
          <EmptyState
            title="No current saved tracks"
            body="Sync or save tracks to your library before building an Audio Profile."
          />
        ) : coverage.profileAvailability === 'NO_DATA' ? (
          <EmptyState
            title="No saved-library audio coverage yet"
            body="Run the explicit enrichment action to start adding cached audio features."
          />
        ) : coverage.profileAvailability === 'LIMITED_SAMPLE' ? (
          <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
            <p className="text-caption font-semibold uppercase tracking-wide text-accent-green">
              LIMITED SAMPLE
            </p>
            <h2 className="mt-2 text-section-title font-semibold">More coverage is needed</h2>
            <p className="mt-3 max-w-3xl text-text-secondary">
              {coverage.audioCoveredTrackCount.toLocaleString()} saved-library{' '}
              {coverage.audioCoveredTrackCount === 1 ? 'track has' : 'tracks have'} available audio
              features. Sound Center and Sound Distance lists become available at 20 covered tracks.
            </p>
            <p className="mt-3 text-body-sm text-text-muted">
              Missing measurements remain unknown and are never replaced with zero.
            </p>
          </section>
        ) : (
          <>
            {coverage.coverageQuality === 'LOW' ? (
              <aside className="mt-8 rounded-card border border-amber-300/30 bg-surface p-4 text-body-sm text-text-secondary">
                This profile is based on the enriched portion of your saved library and may not
                represent the full library yet.
              </aside>
            ) : null}
            <SoundCenterSection center={profile.soundCenter} />
            <FeatureDistribution center={profile.soundCenter} />
            {profile.soundDistanceEligibleTrackCount === 0 ? (
              <EmptyState
                title="Sound Distance is not available"
                body="None of the covered saved tracks has all seven required bounded audio measurements. Missing values are never substituted."
              />
            ) : (
              <>
                <SonicOutliers tracks={profile.sonicOutliers} />
                <ClosestTracks tracks={profile.closestToSoundCenter} />
              </>
            )}
            <MethodDisclosure eligibleTrackCount={profile.soundDistanceEligibleTrackCount} />
          </>
        )}
      </div>
    </main>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <section className="mt-8 rounded-panel border border-dashed border-border-strong p-10 text-center">
      <h2 className="text-section-title font-semibold">{title}</h2>
      <p className="mt-2 text-text-secondary">{body}</p>
    </section>
  );
}

function SoundCenterSection({ center }: { center: SoundCenter }) {
  const metrics: Array<[string, string]> = [
    ...boundedFeatureOrder.map(
      (feature) => [featureLabels[feature], formatBounded(center[feature].p50)] as [string, string],
    ),
    ['Tempo', formatNative(center.tempo.p50, 'BPM')],
    ['Loudness', formatNative(center.loudness.p50, 'dB')],
  ];
  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
      <p className="text-caption font-semibold uppercase tracking-wide text-accent-green">
        MEDIAN PROFILE
      </p>
      <h2 className="mt-2 text-section-title font-semibold">Sound Center</h2>
      <p className="mt-2 max-w-3xl text-body-sm text-text-secondary">
        The median measurement for each characteristic among covered tracks currently saved in your
        library. Sound Center is a profile, not a score.
      </p>
      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-card border border-border-subtle bg-page p-4">
            <dt className="text-caption uppercase tracking-wide text-text-muted">{label}</dt>
            <dd className="mt-2 text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function FeatureDistribution({ center }: { center: SoundCenter }) {
  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
      <h2 className="text-section-title font-semibold">Feature distribution</h2>
      <p className="mt-2 max-w-3xl text-body-sm text-text-secondary">
        The middle 50% runs from the 25th to the 75th percentile. Each marker is the median; missing
        values are excluded from that characteristic.
      </p>
      <div className="mt-6 space-y-5">
        {boundedFeatureOrder.map((feature) => (
          <BoundedDistributionRow
            key={feature}
            label={featureLabels[feature]}
            distribution={center[feature]}
          />
        ))}
        <NativeDistributionRow label="Tempo" distribution={center.tempo} unit="BPM" />
        <NativeDistributionRow label="Loudness" distribution={center.loudness} unit="dB" />
      </div>
    </section>
  );
}

function BoundedDistributionRow({
  label,
  distribution,
}: {
  label: string;
  distribution: SoundDistribution;
}) {
  if (distribution.p25 === null || distribution.p50 === null || distribution.p75 === null) {
    return <DistributionUnavailable label={label} />;
  }
  const p25 = Math.max(0, Math.min(100, distribution.p25 * 100));
  const p50 = Math.max(0, Math.min(100, distribution.p50 * 100));
  const p75 = Math.max(0, Math.min(100, distribution.p75 * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="font-medium">{label}</h3>
        <p className="text-body-sm text-text-secondary">
          {formatBounded(distribution.p25)}–{formatBounded(distribution.p75)} · median{' '}
          {formatBounded(distribution.p50)}
        </p>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-border-subtle" aria-hidden="true">
        <span
          className="absolute top-0 h-2 rounded-full bg-accent-green/55"
          style={{ left: `${p25}%`, width: `${Math.max(1, p75 - p25)}%` }}
        />
        <span
          className="absolute -top-1 h-4 w-1 rounded-full bg-accent-green"
          style={{ left: `calc(${p50}% - 2px)` }}
        />
      </div>
    </div>
  );
}

function NativeDistributionRow({
  label,
  distribution,
  unit,
}: {
  label: string;
  distribution: SoundDistribution;
  unit: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3 border-t border-border-subtle pt-4">
      <h3 className="font-medium">{label}</h3>
      <p className="text-body-sm text-text-secondary">
        {formatNative(distribution.p25, unit)}–{formatNative(distribution.p75, unit)} · median{' '}
        {formatNative(distribution.p50, unit)}
      </p>
    </div>
  );
}

function DistributionUnavailable({ label }: { label: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h3 className="font-medium">{label}</h3>
      <p className="text-body-sm text-text-muted">Not available</p>
    </div>
  );
}

function MethodDisclosure({ eligibleTrackCount }: { eligibleTrackCount: number }) {
  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
      <h2 className="text-section-title font-semibold">Method and coverage</h2>
      <p className="mt-2 max-w-3xl text-body-sm text-text-secondary">
        Sound Distance is the rounded 0–100 RMS distance from Sound Center across seven equally
        weighted features already bounded to 0–1. Tempo and loudness remain descriptive and are
        excluded because they use native scales. Missing measurements stay unavailable.
      </p>
      <p className="mt-3 text-caption text-text-muted">
        {eligibleTrackCount.toLocaleString()} currently covered saved{' '}
        {eligibleTrackCount === 1 ? 'track is' : 'tracks are'} eligible for Sound Distance.
      </p>
    </section>
  );
}

function SonicOutliers({ tracks }: { tracks: SoundProfileTrack[] }) {
  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
      <h2 className="text-section-title font-semibold">Sonic Outliers</h2>
      <p className="mt-2 max-w-3xl text-body-sm text-text-secondary">
        Up to 10 covered saved tracks farthest from Sound Center across the same seven bounded audio
        measurements.
      </p>
      {tracks.length === 0 ? (
        <p className="mt-5 text-text-muted">No eligible Sound Distance rows are available.</p>
      ) : (
        <ol className="mt-6 grid gap-4 lg:grid-cols-2">
          {tracks.map((track) => (
            <li key={track.trackId}>
              <SoundTrackCard track={track} showReasons />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function ClosestTracks({ tracks }: { tracks: SoundProfileTrack[] }) {
  return (
    <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-7">
      <h2 className="text-section-title font-semibold">Closest to Sound Center</h2>
      <p className="mt-2 max-w-3xl text-body-sm text-text-secondary">
        Closest to the median sound profile of your currently covered saved tracks. This list shows
        up to 5 tracks with the smallest Sound Distance.
      </p>
      {tracks.length === 0 ? (
        <p className="mt-5 text-text-muted">No eligible Sound Distance rows are available.</p>
      ) : (
        <ol className="mt-6 space-y-3">
          {tracks.map((track) => (
            <li key={track.trackId}>
              <SoundTrackCard track={track} showReasons={false} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SoundTrackCard({
  track,
  showReasons,
}: {
  track: SoundProfileTrack;
  showReasons: boolean;
}) {
  const body = (
    <div className="flex min-w-0 flex-1 items-center gap-4">
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-card bg-page">
        {isSafeSpotifyImage(track.albumImageUrl) ? (
          <Image src={track.albumImageUrl} alt="" fill sizes="64px" className="object-cover" />
        ) : (
          <Music2 className="absolute inset-0 m-auto h-6 w-6 text-text-muted" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{track.trackName}</p>
        <p className="truncate text-body-sm text-text-secondary">
          {track.artistNames.join(', ') || 'Artist unavailable'} · {track.albumName}
        </p>
        {showReasons ? (
          <ul className="mt-2 space-y-1 text-caption text-text-muted">
            {track.reasons.map((reason) => (
              <li key={reason.feature}>
                {featureLabels[reason.feature]} {formatBounded(reason.trackValue)} vs{' '}
                {formatBounded(reason.centerValue)} Sound Center ·{' '}
                {Math.round(reason.absoluteDifference * 100)} percentage-point difference
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-caption text-text-muted">
            {track.soundDistance} points from the median profile across seven audio measurements.
          </p>
        )}
      </div>
    </div>
  );
  return (
    <article className="flex items-center justify-between gap-4 rounded-card border border-border-subtle bg-page p-4">
      {isSafeSpotifyTrackUrl(track.spotifyUrl) ? (
        <a href={track.spotifyUrl} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
          {body}
        </a>
      ) : (
        body
      )}
      <div className="shrink-0 text-right">
        <p className="text-2xl font-semibold text-accent-green">{track.soundDistance}</p>
        <p className="text-caption uppercase tracking-wide text-text-muted">Sound Distance</p>
        {isSafeSpotifyTrackUrl(track.spotifyUrl) ? (
          <ExternalLink className="ml-auto mt-2 h-4 w-4 text-text-muted" aria-hidden="true" />
        ) : null}
      </div>
    </article>
  );
}
