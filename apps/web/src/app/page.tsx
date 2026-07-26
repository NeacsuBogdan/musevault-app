import Link from 'next/link';
import { ConnectedProfile } from '@/components/connected-profile';
import { readSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const primaryActionClasses =
  'inline-flex min-h-12 items-center justify-center rounded-full bg-emerald-300 px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-200 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300';

const secondaryActionClasses =
  'inline-flex min-h-12 items-center justify-center rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300';

type HomePageProps = {
  searchParams: Promise<{
    spotifyError?: string | string[];
  }>;
};

const spotifyConnectionErrors: Record<string, { title: string; message: string }> = {
  authorization_expired: {
    title: 'Your Spotify connection has expired',
    message: 'Connect Spotify again to restore secure, read-only access to your saved tracks.',
  },
  access_denied: {
    title: 'Spotify connection cancelled',
    message:
      'You did not grant access, so MuseVault made no changes. Connect whenever you are ready.',
  },
  authorization_failed: {
    title: 'Spotify could not complete authorization',
    message: 'The authorization request was not completed. Start a new connection to try again.',
  },
  state_mismatch: {
    title: 'The Spotify request could not be verified',
    message: 'For your security, that connection was stopped. Start a new connection to continue.',
  },
  invalid_callback: {
    title: 'The Spotify response was incomplete',
    message: 'MuseVault could not finish that connection safely. Please start a new one.',
  },
  token_exchange_failed: {
    title: 'Spotify could not complete the connection',
    message: 'MuseVault could not finish authorization. Please wait a moment, then try again.',
  },
  profile_failed: {
    title: 'Your Spotify profile could not be loaded',
    message: 'MuseVault could not finish setting up your connection. Please try again.',
  },
  session_failed: {
    title: 'The secure session could not be created',
    message: 'Your Spotify connection was not saved. Please start a new connection.',
  },
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const [session, resolvedSearchParams] = await Promise.all([readSession(), searchParams]);
  const spotifyErrorCode =
    typeof resolvedSearchParams.spotifyError === 'string'
      ? resolvedSearchParams.spotifyError
      : null;
  const spotifyError = spotifyErrorCode ? spotifyConnectionErrors[spotifyErrorCode] : undefined;

  return (
    <main className="relative min-h-screen overflow-hidden bg-zinc-950 text-zinc-50">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(circle_at_top_left,rgba(52,211,153,0.18),transparent_45%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_38%)]"
        aria-hidden="true"
      />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-8 sm:px-10 lg:px-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-6">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-white focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-300"
          >
            MuseVault
          </Link>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300">
            Spotify library discovery
          </span>
        </header>

        <div className="grid flex-1 items-center gap-16 py-16 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:py-24">
          <section aria-labelledby="home-heading">
            {spotifyError ? (
              <div
                className="mb-8 max-w-2xl rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] px-5 py-4"
                role="alert"
              >
                <p className="font-semibold text-amber-100">{spotifyError.title}</p>
                <p className="mt-1 text-sm leading-6 text-zinc-300">{spotifyError.message}</p>
              </div>
            ) : null}
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">
              Your library, seen differently
            </p>
            <h1
              id="home-heading"
              className="mt-5 max-w-3xl text-5xl font-semibold tracking-[-0.045em] text-white sm:text-7xl"
            >
              Find the next song hiding inside your taste.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-zinc-300 sm:text-xl">
              MuseVault is a personal music discovery app built around the tracks you already save
              on Spotify. The first step is a private, read-only view of your library.
            </p>

            {session ? (
              <div className="mt-10 flex flex-wrap gap-3">
                <Link href="/library" className={primaryActionClasses}>
                  Open your library
                </Link>
                <form action="/api/auth/spotify/logout" method="post">
                  <button type="submit" className={secondaryActionClasses}>
                    Disconnect Spotify
                  </button>
                </form>
              </div>
            ) : (
              <div className="mt-10">
                <a href="/api/auth/spotify/login" className={primaryActionClasses}>
                  Connect with Spotify
                </a>
                <p className="mt-4 max-w-lg text-sm leading-6 text-zinc-400">
                  MuseVault requests access to read your saved tracks. It cannot edit your library,
                  playlists, or playback.
                </p>
              </div>
            )}
          </section>

          <aside
            className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8"
            aria-label={session ? 'Spotify connection' : 'How MuseVault starts'}
          >
            {session ? (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  Spotify connected
                </p>
                <div className="mt-5">
                  <ConnectedProfile displayName={session.displayName} imageUrl={session.imageUrl} />
                </div>
                <p className="mt-6 text-sm leading-6 text-zinc-400">
                  Your access and refresh tokens stay encrypted in an HttpOnly session and are never
                  sent to browser code.
                </p>
              </>
            ) : (
              <>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                  First milestone
                </p>
                <ol className="mt-6 space-y-6">
                  <li className="grid grid-cols-[2rem_1fr] gap-3">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-300/10 text-sm font-semibold text-emerald-300"
                      aria-hidden="true"
                    >
                      1
                    </span>
                    <div>
                      <h2 className="font-medium text-white">Connect securely</h2>
                      <p className="mt-1 text-sm leading-6 text-zinc-400">
                        Authorize read-only access through Spotify.
                      </p>
                    </div>
                  </li>
                  <li className="grid grid-cols-[2rem_1fr] gap-3">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-300/10 text-sm font-semibold text-cyan-300"
                      aria-hidden="true"
                    >
                      2
                    </span>
                    <div>
                      <h2 className="font-medium text-white">Explore saved tracks</h2>
                      <p className="mt-1 text-sm leading-6 text-zinc-400">
                        See the first 50 songs and the size of your collection.
                      </p>
                    </div>
                  </li>
                  <li className="grid grid-cols-[2rem_1fr] gap-3">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-sm font-semibold text-zinc-500"
                      aria-hidden="true"
                    >
                      3
                    </span>
                    <div>
                      <h2 className="font-medium text-zinc-300">Build discovery next</h2>
                      <p className="mt-1 text-sm leading-6 text-zinc-500">
                        Recommendations are not implemented in this milestone.
                      </p>
                    </div>
                  </li>
                </ol>
              </>
            )}
          </aside>
        </div>
      </div>
    </main>
  );
}
