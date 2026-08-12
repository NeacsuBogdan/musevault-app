import Image from 'next/image';
import { Disc3 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import type { DashboardAnalyticsModel } from '../types';

export function TopAlbumsCard({ albums }: { albums: DashboardAnalyticsModel['topAlbums'] | null }) {
  return (
    <Card variant="elevated" padding="lg">
      <h3 className="text-card-title font-semibold text-text-primary">
        Top albums by saved tracks
      </h3>
      <p className="mt-1 text-body-sm text-text-secondary">
        Albums represented in your current saved library.
      </p>
      {!albums ? (
        <p className="mt-8 text-body-sm text-text-muted">Albums unavailable.</p>
      ) : albums.length === 0 ? (
        <div className="mt-7 text-center">
          <Disc3 className="mx-auto text-text-muted" aria-hidden="true" size={20} />
          <p className="mt-3 text-body-sm font-semibold">No albums yet</p>
        </div>
      ) : (
        <ol className="mt-5 divide-y divide-border-subtle">
          {albums.map((album) => (
            <li key={album.id} className="flex items-center gap-3 py-2.5">
              {album.imageUrl ? (
                <Image
                  src={album.imageUrl}
                  alt={`Cover artwork for ${album.name}`}
                  width={40}
                  height={40}
                  className="size-10 rounded-control object-cover"
                />
              ) : (
                <span
                  role="img"
                  aria-label={`No cover artwork for ${album.name}`}
                  className="grid size-10 place-items-center rounded-control bg-surface-hover"
                >
                  <Disc3 aria-hidden="true" size={17} />
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-body-sm font-semibold">
                {album.name}
              </span>
              <span className="text-caption text-text-secondary">
                {album.savedTrackCount} tracks
              </span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
