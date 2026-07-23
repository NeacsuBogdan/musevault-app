import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ConnectedProfile } from '@/components/connected-profile';
import { SavedTracksList } from '@/components/saved-tracks-list';
import { readSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Your library',
  description: 'Browse the first page of tracks saved to your Spotify library.',
};

export const dynamic = 'force-dynamic';

export default async function LibraryPage() {
  const session = await readSession();

  if (!session) {
    redirect('/');
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <header className="border-b border-white/10 bg-zinc-950/90">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5 sm:px-10 lg:px-12">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-white focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300"
          >
            MuseVault
          </Link>
          <form action="/api/auth/spotify/logout" method="post">
            <button
              type="submit"
              className="rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/30 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300"
            >
              Disconnect
            </button>
          </form>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10 sm:py-14 lg:px-12">
        <section
          className="grid gap-8 border-b border-white/10 pb-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
          aria-labelledby="library-heading"
        >
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Saved tracks
            </p>
            <h1
              id="library-heading"
              className="mt-3 text-4xl font-semibold tracking-[-0.035em] text-white sm:text-5xl"
            >
              Your Spotify library
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-400">
              This read-only view loads the first 50 tracks you have saved. Your Spotify tokens
              remain on the server.
            </p>
          </div>
          <ConnectedProfile displayName={session.displayName} imageUrl={session.imageUrl} compact />
        </section>

        <SavedTracksList />
      </div>
    </main>
  );
}
