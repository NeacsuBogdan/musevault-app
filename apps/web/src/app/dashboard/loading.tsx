import { Card } from '@/components/ui/card';

export default function DashboardLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-page p-page-gutter text-text-primary">
      <Card variant="elevated" padding="lg" className="w-full max-w-md text-center" role="status">
        <span
          aria-hidden="true"
          className="mx-auto block size-8 animate-spin rounded-full border-2 border-border-strong border-t-accent-green motion-reduce:animate-none"
        />
        <h1 className="mt-5 text-section-title font-semibold">Loading your dashboard</h1>
        <p className="mt-2 text-body-sm text-text-secondary">
          MuseVault is reading your latest saved tracks securely from Spotify.
        </p>
      </Card>
    </main>
  );
}
