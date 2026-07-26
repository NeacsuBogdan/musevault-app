import Image from 'next/image';

import type { DashboardProfile } from '../types';

interface DashboardProfileAvatarProps {
  profile: DashboardProfile;
}

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

export function DashboardProfileAvatar({ profile }: DashboardProfileAvatarProps) {
  if (isAllowedSpotifyImage(profile.imageUrl)) {
    return (
      <Image
        src={profile.imageUrl}
        alt={`${profile.displayName}'s Spotify profile`}
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-purple/15 text-caption font-semibold text-accent-purple"
    >
      {profile.initials}
    </span>
  );
}
