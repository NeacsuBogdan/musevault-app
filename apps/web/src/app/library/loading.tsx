export default function LibraryLoading() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50" aria-busy="true">
      <header className="border-b border-white/10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 sm:px-10 lg:px-12">
          <span className="text-lg font-semibold tracking-tight text-white">MuseVault</span>
          <div className="h-9 w-24 rounded-full bg-white/10 motion-safe:animate-pulse" />
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-10 sm:py-14 lg:px-12">
        <div className="border-b border-white/10 pb-10">
          <div className="h-4 w-28 rounded bg-emerald-300/15 motion-safe:animate-pulse" />
          <div className="mt-5 h-12 w-full max-w-md rounded bg-white/10 motion-safe:animate-pulse" />
          <div className="mt-5 h-5 w-full max-w-xl rounded bg-white/5 motion-safe:animate-pulse" />
        </div>
        <div className="py-10">
          <p className="sr-only" role="status">
            Loading your Spotify library
          </p>
          <div className="h-7 w-48 rounded bg-white/10 motion-safe:animate-pulse" />
          <div className="mt-6 space-y-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="h-24 rounded-2xl border border-white/5 bg-white/[0.025] motion-safe:animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
