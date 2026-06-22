export default function HomePage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-50">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center px-6 py-20">
        <p className="mb-5 text-sm font-medium uppercase tracking-normal text-cyan-300">
          Creative archive for music work
        </p>
        <h1 className="max-w-4xl text-5xl font-semibold tracking-tight text-white sm:text-7xl">
          MuseVault
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-zinc-300">
          A focused workspace for organizing music ideas, creative assets, metadata, and production
          workflows as the product foundation evolves.
        </p>
        <div className="mt-12 grid gap-4 text-sm text-zinc-400 sm:grid-cols-3">
          <div className="border-l border-cyan-300/50 pl-4">
            No Spotify integration configured yet.
          </div>
          <div className="border-l border-cyan-300/50 pl-4">No authentication configured yet.</div>
          <div className="border-l border-cyan-300/50 pl-4">No database configured yet.</div>
        </div>
      </section>
    </main>
  );
}
