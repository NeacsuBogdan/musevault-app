import Image from 'next/image';

type ConnectedProfileProps = {
  displayName: string | null;
  imageUrl: string | null;
  compact?: boolean;
};

function isAllowedSpotifyImage(imageUrl: string | null): imageUrl is string {
  if (!imageUrl) {
    return false;
  }

  try {
    const url = new URL(imageUrl);
    return url.protocol === 'https:' && url.hostname === 'i.scdn.co';
  } catch {
    return false;
  }
}

function getInitial(displayName: string) {
  return displayName.trim().charAt(0).toLocaleUpperCase() || 'M';
}

export function ConnectedProfile({
  displayName,
  imageUrl,
  compact = false,
}: ConnectedProfileProps) {
  const resolvedDisplayName = displayName?.trim() || 'Spotify listener';
  const imageSize = compact ? 44 : 56;

  return (
    <div className="flex items-center gap-4">
      {isAllowedSpotifyImage(imageUrl) ? (
        <Image
          src={imageUrl}
          alt={`${resolvedDisplayName}'s Spotify profile`}
          width={imageSize}
          height={imageSize}
          className="shrink-0 rounded-full object-cover"
        />
      ) : (
        <span
          className={`flex shrink-0 items-center justify-center rounded-full bg-emerald-300/15 font-semibold text-emerald-200 ${
            compact ? 'h-11 w-11 text-sm' : 'h-14 w-14 text-lg'
          }`}
          aria-hidden="true"
        >
          {getInitial(resolvedDisplayName)}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs font-medium text-zinc-500">Connected as</p>
        <p className="truncate font-semibold text-white">{resolvedDisplayName}</p>
      </div>
    </div>
  );
}
