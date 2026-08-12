import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ListeningSyncButton } from '@/components/listening-sync-button';
import { getListeningInsights } from '@/lib/db/repositories/listening-intelligence';
import { readSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Listening Insights',
  description: 'View listening history recorded by MuseVault and Spotify affinity snapshots.',
};
export const dynamic = 'force-dynamic';
const date = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
function formatDate(value: string | null) {
  return value ? date.format(new Date(value)) : 'No recorded plays yet';
}
const rangeLabel = {
  short_term: 'Short term',
  medium_term: 'Medium term',
  long_term: 'Long term',
} as const;

export default async function ListeningPage() {
  const session = await readSession();
  if (!session) redirect('/');
  const insights = await getListeningInsights(session.accountId);
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/dashboard" className="font-semibold">
            MuseVault
          </Link>
          <nav className="flex gap-4 text-sm text-zinc-300">
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/library">Library</Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
          Recorded listening history
        </p>
        <h1 className="mt-3 text-4xl font-semibold">Listening Insights</h1>
        <p className="mt-4 max-w-3xl text-zinc-400">
          MuseVault stores listening events available from Spotify Recently Played to build
          long-term personal analytics. Long gaps between manual syncs can leave gaps that Spotify
          can no longer provide.
        </p>
        {insights.authorizationRequired ? (
          <section className="mt-10 rounded-2xl border border-white/10 p-7">
            <h2 className="text-2xl font-semibold">Enable listening insights</h2>
            <p className="mt-3 text-zinc-400">
              Additional Spotify permission is required for Recently Played and Top Items. Your
              saved library and existing MuseVault data stay intact.
            </p>
            <a
              href="/api/auth/spotify/login"
              className="mt-6 inline-block rounded-full bg-emerald-300 px-5 py-2.5 font-semibold text-zinc-950"
            >
              Enable listening insights
            </a>
          </section>
        ) : (
          <>
            <section className="mt-10 flex flex-wrap items-end justify-between gap-5 rounded-2xl border border-white/10 p-7">
              <div>
                <h2 className="text-2xl font-semibold">Listening synchronization</h2>
                <p className="mt-2 text-zinc-400">
                  Manual, idempotent capture of available recent Spotify history and daily affinity
                  rankings.
                </p>
              </div>
              <ListeningSyncButton hasHistory={insights.summary.totalRecordedPlays > 0} />
            </section>
            {insights.sync.status === 'running' ? (
              <p role="status" className="mt-6 text-emerald-200">
                Listening sync is in progress · {insights.sync.processedPlayCount} plays recorded
              </p>
            ) : null}
            {insights.summary.totalRecordedPlays === 0 ? (
              <section className="mt-8 rounded-2xl border border-dashed border-white/15 p-10 text-center">
                <h2 className="text-xl font-semibold">No listening history recorded yet</h2>
                <p className="mt-2 text-zinc-400">
                  Start a sync to capture the recent history Spotify currently makes available.
                </p>
              </section>
            ) : (
              <>
                <section className="mt-8 grid gap-4 sm:grid-cols-3">
                  <Stat label="Recorded plays" value={insights.summary.totalRecordedPlays} />
                  <Stat label="Unique tracks" value={insights.summary.distinctTracks} />
                  <Stat label="Unique credited artists" value={insights.summary.distinctArtists} />
                </section>
                <section className="mt-8 grid gap-4 rounded-2xl border border-white/10 p-7 sm:grid-cols-2">
                  <Fact
                    label="History recorded from"
                    value={formatDate(insights.summary.earliestPlayedAt)}
                  />
                  <Fact
                    label="Latest recorded play"
                    value={formatDate(insights.summary.latestPlayedAt)}
                  />
                </section>
                <section className="mt-8 rounded-2xl border border-white/10 p-7">
                  <h2 className="text-2xl font-semibold">Recent recorded plays</h2>
                  <ol className="mt-5 divide-y divide-white/10">
                    {insights.recentPlays.map((play) => (
                      <li
                        key={`${play.trackId}-${play.playedAt}`}
                        className="flex justify-between gap-4 py-3"
                      >
                        <span className="font-medium">{play.trackName}</span>
                        <time className="text-sm text-zinc-400" dateTime={play.playedAt}>
                          {date.format(new Date(play.playedAt))} UTC
                        </time>
                      </li>
                    ))}
                  </ol>
                </section>
                <section className="mt-8 rounded-2xl border border-white/10 p-7">
                  <h2 className="text-2xl font-semibold">Recorded plays · last 7 days</h2>
                  <p className="mt-2 text-zinc-400">
                    Based on {insights.recentPeriod.recordedCoverageDays} day
                    {insights.recentPeriod.recordedCoverageDays === 1 ? '' : 's'} of recorded
                    history. Unknown history is not counted as zero.
                  </p>
                  <div className="mt-6 grid gap-8 md:grid-cols-2">
                    <Ranked
                      title="Top tracks by recorded plays"
                      items={insights.recentPeriod.topTracks}
                    />
                    <Ranked
                      title="Top credited artists by recorded plays"
                      items={insights.recentPeriod.topArtists}
                    />
                  </div>
                </section>
              </>
            )}
            {insights.affinity.length ? (
              <section className="mt-8 rounded-2xl border border-white/10 p-7">
                <h2 className="text-2xl font-semibold">Spotify affinity</h2>
                <p className="mt-2 text-zinc-400">
                  Spotify-calculated rankings, shown separately from MuseVault recorded play counts.
                </p>
                <div className="mt-6 grid gap-6 lg:grid-cols-3">
                  {insights.affinity.map((group) => (
                    <div key={group.timeRange}>
                      <h3 className="font-semibold text-emerald-200">
                        {rangeLabel[group.timeRange]} affinity
                      </h3>
                      <p className="mt-3 text-xs uppercase text-zinc-500">
                        Top on Spotify · artists
                      </p>
                      <ol className="mt-2 space-y-1 text-sm">
                        {group.artists.slice(0, 5).map((item) => (
                          <li key={item.id}>
                            {item.rank}. {item.name}
                          </li>
                        ))}
                      </ol>
                      <p className="mt-4 text-xs uppercase text-zinc-500">
                        Top on Spotify · tracks
                      </p>
                      <ol className="mt-2 space-y-1 text-sm">
                        {group.tracks.slice(0, 5).map((item) => (
                          <li key={item.id}>
                            {item.rank}. {item.name}
                          </li>
                        ))}
                      </ol>
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
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 p-6">
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value.toLocaleString()}</p>
    </div>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
function Ranked({
  title,
  items,
}: {
  title: string;
  items: Array<{ id: string; name: string; playCount: number }>;
}) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      {items.length ? (
        <ol className="mt-3 space-y-2">
          {items.map((item, index) => (
            <li key={item.id} className="flex justify-between">
              <span>
                {index + 1}. {item.name}
              </span>
              <span className="text-zinc-400">{item.playCount}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-zinc-500">No recorded plays in this captured period.</p>
      )}
    </div>
  );
}
