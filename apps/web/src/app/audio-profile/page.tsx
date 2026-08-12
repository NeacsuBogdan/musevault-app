import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AudioEnrichmentButton } from '@/components/audio-enrichment-button';
import {
  getAudioProfileSummary,
  resolveAudioProfileUser,
} from '@/lib/db/repositories/audio-profile';
import { readSession } from '@/lib/auth/session';
export const metadata: Metadata = {
  title: 'Audio Profile',
  description: 'Provider-derived audio characteristics with explicit coverage context.',
};
export const dynamic = 'force-dynamic';
const percent = (value: number) => `${Math.round(value)}%`;
const metric = (value: number | null, unit = '') =>
  value === null ? 'Not available' : `${Math.round(value * (unit === '%' ? 100 : 1))}${unit}`;
export default async function AudioProfilePage() {
  const session = await readSession();
  if (!session) redirect('/');
  const userId = await resolveAudioProfileUser(session.accountId);
  if (!userId) redirect('/library');
  const profile = await getAudioProfileSummary(userId);
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl justify-between px-6 py-5">
          <Link href="/dashboard" className="font-semibold">
            MuseVault
          </Link>
          <nav className="flex gap-4 text-sm text-zinc-300">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/listening">Listening</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Provider-derived characteristics
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Audio Profile</h1>
        <p className="mt-4 max-w-3xl text-zinc-400">
          MuseVault uses ReccoBeats to retrieve derived audio characteristics. When you choose
          enrichment, Spotify track identifiers are sent to ReccoBeats for lookup. No Spotify token
          is sent, and ReccoBeats currently requires no API key.
        </p>
        <section className="mt-10 flex flex-wrap items-end justify-between gap-6 rounded-2xl border border-white/10 p-7">
          <div>
            <h2 className="text-2xl font-semibold">Audio-feature coverage</h2>
            <p className="mt-2 text-zinc-400">
              {profile.enriched.toLocaleString()} / {profile.candidates.toLocaleString()} relevant
              tracks · {percent(profile.coveragePercentage)}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              Available features are cached globally; missing tracks are retried after a cooldown.
            </p>
          </div>
          <AudioEnrichmentButton hasCoverage={profile.enriched > 0} />
        </section>
        {profile.enriched === 0 ? (
          <section className="mt-8 rounded-2xl border border-dashed border-white/15 p-10 text-center">
            <h2 className="text-xl font-semibold">No audio enrichment yet</h2>
            <p className="mt-2 text-zinc-400">
              Run the explicit enrichment action to begin building a real profile.
            </p>
          </section>
        ) : (
          <>
            <Profile
              title="Current saved-library audio profile"
              coverage={`${profile.library.enriched} / ${profile.library.total} saved tracks`}
              values={[
                ['Average tempo', metric(profile.library.averageTempo, ' BPM')],
                ['Average energy', metric(profile.library.averageEnergy, '%')],
                ['Average valence', metric(profile.library.averageValence, '%')],
                ['Average danceability', metric(profile.library.averageDanceability, '%')],
                ['Average acousticness', metric(profile.library.averageAcousticness, '%')],
                ['Average instrumentalness', metric(profile.library.averageInstrumentalness, '%')],
              ]}
            />
            <section className="mt-8 rounded-2xl border border-white/10 p-7">
              <h2 className="text-2xl font-semibold">Saved-library tempo distribution</h2>
              <p className="mt-2 text-zinc-400">
                Display buckets among enriched current saved tracks.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-4">
                {profile.library.tempoBuckets.map((bucket) => (
                  <div key={bucket.label} className="rounded-xl bg-white/[0.04] p-4">
                    <p className="text-sm text-zinc-400">{bucket.label}</p>
                    <p className="mt-2 text-2xl font-semibold">{bucket.count}</p>
                  </div>
                ))}
              </div>
            </section>
            <Profile
              title="Recorded listening audio profile"
              coverage={`Based on ${profile.listening.enrichedEvents} of ${profile.listening.totalEvents} recorded play events with available features · ${profile.listening.coverageDays} recorded coverage days`}
              values={[
                ['Play-weighted tempo', metric(profile.listening.averageTempo, ' BPM')],
                ['Play-weighted energy', metric(profile.listening.averageEnergy, '%')],
                ['Play-weighted valence', metric(profile.listening.averageValence, '%')],
                ['Play-weighted danceability', metric(profile.listening.averageDanceability, '%')],
              ]}
            />
          </>
        )}
      </div>
    </main>
  );
}
function Profile({
  title,
  coverage,
  values,
}: {
  title: string;
  coverage: string;
  values: Array<[string, string]>;
}) {
  return (
    <section className="mt-8 rounded-2xl border border-white/10 p-7">
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-zinc-400">
        {coverage}. Missing features are excluded, never treated as zero.
      </p>
      <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {values.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white/[0.04] p-4">
            <dt className="text-sm text-zinc-400">{label}</dt>
            <dd className="mt-2 text-xl font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
