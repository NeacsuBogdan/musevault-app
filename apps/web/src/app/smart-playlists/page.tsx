import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ExternalLink, Music2 } from 'lucide-react';
import { redirect } from 'next/navigation';
import { SmartPlaylistExport } from '@/components/smart-playlist-export';
import { readSession } from '@/lib/auth/session';
import {
  getSmartPlaylistPreview,
  type SmartPlaylistTrack,
} from '@/lib/db/repositories/smart-playlists';
import { getSpotifyPlaylistExportCapability } from '@/lib/db/repositories/spotify-playlist-export';
import { SMART_PLAYLIST_PRESETS, SMART_PLAYLIST_SORTS } from '@/lib/smart-playlists/definitions';

export const metadata: Metadata = {
  title: 'Smart Playlists',
  description: 'Deterministic saved-library playlist previews.',
};
export const dynamic = 'force-dynamic';
const filterFields = [
  ['tempoMin', 'Tempo min', 'BPM'],
  ['tempoMax', 'Tempo max', 'BPM'],
  ['energyMin', 'Energy min', '%'],
  ['energyMax', 'Energy max', '%'],
  ['valenceMin', 'Valence min', '%'],
  ['valenceMax', 'Valence max', '%'],
  ['danceabilityMin', 'Danceability min', '%'],
  ['danceabilityMax', 'Danceability max', '%'],
  ['acousticnessMin', 'Acousticness min', '%'],
  ['acousticnessMax', 'Acousticness max', '%'],
  ['instrumentalnessMin', 'Instrumentalness min', '%'],
  ['instrumentalnessMax', 'Instrumentalness max', '%'],
] as const;
const sortLabels: Record<(typeof SMART_PLAYLIST_SORTS)[number], string> = {
  'saved-newest': 'Saved newest',
  'saved-oldest': 'Saved oldest',
  'tempo-asc': 'Tempo ascending',
  'tempo-desc': 'Tempo descending',
  'energy-desc': 'Energy descending',
  'danceability-desc': 'Danceability descending',
  'valence-desc': 'Valence descending',
  'acousticness-desc': 'Acousticness descending',
  'instrumentalness-desc': 'Instrumentalness descending',
};
const date = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const duration = (milliseconds: number) =>
  `${Math.floor(milliseconds / 60_000)}:${String(Math.floor(milliseconds / 1_000) % 60).padStart(2, '0')}`;
const percent = (value: number) => `${Math.round(value)}%`;

export default async function SmartPlaylistsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await readSession();
  if (!session) redirect('/');
  const params = await searchParams;
  const preview = await getSmartPlaylistPreview(session.accountId, params);
  const canExport = preview.state === 'success' && preview.tracks.length > 0;
  const hasExportScope = canExport
    ? await getSpotifyPlaylistExportCapability(session.accountId).catch(() => null)
    : null;
  const exportDefinition: Record<string, string> = {};
  if (preview.preset) {
    exportDefinition.preset = preview.preset;
  } else {
    for (const name of [...filterFields.map(([name]) => name), 'sort', 'limit']) {
      const value = params[name];
      if (typeof value === 'string') exportDefinition[name] = value;
    }
  }
  const exportQuery = new URLSearchParams(exportDefinition).toString();
  const returnTo = `/smart-playlists${exportQuery ? `?${exportQuery}` : ''}`;
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
            <Link href="/audio-profile">Audio Profile</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-caption font-semibold uppercase tracking-[0.18em] text-accent-green">
          SMART PLAYLISTS
        </p>
        <h1 className="mt-3 text-page-title font-semibold">Smart Playlists</h1>
        <p className="mt-4 max-w-3xl text-body text-text-secondary">
          Build deterministic track sets from your saved library using audio features MuseVault has
          already cached.
        </p>
        <p className="mt-3 rounded-card border border-border-subtle bg-surface p-4 text-body-sm text-text-secondary">
          Spotify playlists are created only when you choose export. Generating a preview uses
          cached library data and makes no provider or enrichment requests.
        </p>

        <section className="mt-8">
          <h2 className="text-section-title font-semibold">Presets</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {Object.entries(SMART_PLAYLIST_PRESETS).map(([slug, preset]) => (
              <Link
                key={slug}
                href={`/smart-playlists?preset=${slug}`}
                className="rounded-card border border-border-subtle bg-surface p-4 transition hover:bg-surface-hover"
              >
                <strong className="block text-body-sm">{preset.displayName}</strong>
                <span className="mt-2 block text-caption text-text-secondary">{preset.rule}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-panel border border-border-subtle bg-surface p-6">
          <h2 className="text-section-title font-semibold">Custom builder</h2>
          <form action="/smart-playlists" method="get" className="mt-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {filterFields.map(([name, label, unit]) => (
                <label key={name} className="text-body-sm text-text-secondary">
                  {label} ({unit})
                  <input
                    name={name}
                    type="number"
                    min="0"
                    max={unit === 'BPM' ? 300 : 100}
                    step="any"
                    defaultValue={typeof params[name] === 'string' ? params[name] : ''}
                    className="mt-1 block w-full rounded-control border border-border-strong bg-page px-3 py-2 text-text-primary"
                  />
                </label>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-4">
              <label className="text-body-sm text-text-secondary">
                Sort
                <select
                  name="sort"
                  defaultValue={typeof params.sort === 'string' ? params.sort : 'saved-newest'}
                  className="mt-1 block rounded-control border border-border-strong bg-page px-3 py-2 text-text-primary"
                >
                  {SMART_PLAYLIST_SORTS.map((sort) => (
                    <option key={sort} value={sort}>
                      {sortLabels[sort]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-body-sm text-text-secondary">
                Limit
                <select
                  name="limit"
                  defaultValue={typeof params.limit === 'string' ? params.limit : '30'}
                  className="mt-1 block rounded-control border border-border-strong bg-page px-3 py-2 text-text-primary"
                >
                  {[20, 30, 50].map((limit) => (
                    <option key={limit}>{limit}</option>
                  ))}
                </select>
              </label>
              <button className="rounded-control bg-accent-green px-5 py-2.5 text-body-sm font-semibold text-page">
                Generate preview
              </button>
              <Link
                href="/smart-playlists"
                className="px-2 py-2 text-body-sm font-semibold text-text-secondary"
              >
                Clear filters
              </Link>
            </div>
          </form>
        </section>

        <section
          aria-label="Smart playlist summary"
          className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          <Summary label="Current saved library" value={preview.summary.currentSavedTrackCount} />
          <Summary
            label="Audio-feature coverage"
            value={`${preview.summary.audioFeatureCount} / ${preview.summary.currentSavedTrackCount}`}
          />
          <Summary label="Tracks matching filters" value={preview.summary.matchingTrackCount} />
          <Summary label="Tracks in this preview" value={preview.summary.previewTrackCount} />
          <Summary label="Preview duration" value={duration(preview.summary.previewDurationMs)} />
        </section>
        <p className="mt-3 text-body-sm text-text-muted">
          Audio filters can currently evaluate {preview.summary.audioFeatureCount.toLocaleString()}{' '}
          of {preview.summary.currentSavedTrackCount.toLocaleString()} saved tracks. Missing
          features are unknown, never treated as zero or as a failed match.{' '}
          <Link href="/audio-profile" className="font-semibold text-accent-green">
            Enrich more tracks in Audio Profile
          </Link>
          .
        </p>
        <PreviewState state={preview.state} message={preview.validation?.message} />
        {canExport ? (
          <SmartPlaylistExport
            key={returnTo}
            definition={exportDefinition}
            initialName={`MuseVault — ${preview.preset ? SMART_PLAYLIST_PRESETS[preview.preset].displayName : 'Smart Playlist'}`}
            hasExportScope={hasExportScope}
            returnTo={returnTo}
            authorizationFailed={typeof params.spotifyError === 'string'}
          />
        ) : null}
        {preview.tracks.length ? (
          <ol className="mt-8 space-y-3">
            {preview.tracks.map((track) => (
              <TrackRow key={track.trackId} track={track} />
            ))}
          </ol>
        ) : null}
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
function PreviewState({ state, message }: { state: string; message?: string }) {
  const copy: Record<string, [string, string]> = {
    builder: [
      'Choose a preset or build your own',
      'No arbitrary playlist is generated until you request a definition.',
    ],
    invalid_definition: [
      'Invalid filter definition',
      message ?? 'Review the filter values and try again.',
    ],
    sync_required: [
      'Library sync required',
      'Complete a full library sync before generating previews.',
    ],
    sync_in_progress: [
      'Library sync in progress',
      'Previews are paused until the authoritative full sync finishes.',
    ],
    empty_library: ['Empty library', 'Your completed library snapshot contains no saved tracks.'],
    no_audio_coverage: [
      'No audio-feature coverage yet',
      'Saved tracks cannot be evaluated until audio features are explicitly enriched.',
    ],
    no_matches: [
      'No tracks match these filters',
      'Available audio features were evaluated, but no current saved track satisfied every filter.',
    ],
  };
  if (state === 'success') return null;
  const content = copy[state] ?? copy.builder!;
  return (
    <section className="mt-8 rounded-panel border border-dashed border-border-strong p-10 text-center">
      <h2 className="text-section-title font-semibold">{content[0]}</h2>
      <p className="mt-2 text-body text-text-secondary">{content[1]}</p>
      {state === 'sync_required' ? (
        <Link href="/library" className="mt-4 inline-block font-semibold text-accent-green">
          Open Library
        </Link>
      ) : null}
    </section>
  );
}
function safeImage(url: string | null) {
  try {
    const parsed = new URL(url ?? '');
    return parsed.protocol === 'https:' && parsed.hostname === 'i.scdn.co';
  } catch {
    return false;
  }
}
function safeTrack(url: string) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'open.spotify.com' &&
      parsed.pathname.startsWith('/track/')
    );
  } catch {
    return false;
  }
}
function TrackRow({ track }: { track: SmartPlaylistTrack }) {
  const chips = [
    track.features.tempo === null ? null : `${Math.round(track.features.tempo)} BPM`,
    track.features.energy === null ? null : `${percent(track.features.energy * 100)} energy`,
    track.features.danceability === null
      ? null
      : `${percent(track.features.danceability * 100)} danceability`,
  ].filter((chip): chip is string => chip !== null);
  return (
    <li className="rounded-card border border-border-subtle bg-surface p-4">
      <div className="flex gap-4">
        {safeImage(track.albumImageUrl) ? (
          <Image
            src={track.albumImageUrl!}
            alt={`Cover artwork for ${track.albumName}`}
            width={72}
            height={72}
            className="size-18 rounded-control object-cover"
          />
        ) : (
          <span className="grid size-18 shrink-0 place-items-center rounded-control bg-surface-hover text-text-muted">
            <Music2 aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <h2 className="font-semibold">
                {track.trackName}
                {track.explicit ? (
                  <span className="ml-2 text-caption text-text-muted">Explicit</span>
                ) : null}
              </h2>
              <p className="text-body-sm text-text-secondary">{track.artistNames.join(', ')}</p>
              <p className="text-caption text-text-muted">{track.albumName}</p>
            </div>
            <div className="text-right text-caption text-text-muted">
              <p>Saved {date.format(new Date(track.savedAt))}</p>
              <p>{duration(track.durationMs)}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-pill bg-surface-hover px-2.5 py-1 text-caption text-text-secondary"
              >
                {chip}
              </span>
            ))}
            {safeTrack(track.spotifyUrl) ? (
              <a
                href={track.spotifyUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-auto inline-flex items-center gap-1 text-body-sm font-semibold text-accent-green"
              >
                Open in Spotify <ExternalLink size={13} />
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
