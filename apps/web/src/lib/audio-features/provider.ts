import 'server-only';

export const AUDIO_FEATURE_PROVIDER = 'reccobeats' as const;
export const AUDIO_FEATURE_BATCH_LIMIT = 20;

export interface ProviderAudioFeatures {
  spotifyTrackId: string;
  providerTrackId: string;
  acousticness: number;
  danceability: number;
  energy: number;
  instrumentalness: number;
  liveness: number;
  loudness: number;
  speechiness: number;
  tempo: number;
  valence: number;
}

export interface AudioFeatureProviderResult {
  available: ProviderAudioFeatures[];
  notFoundSpotifyTrackIds: string[];
}

export interface AudioFeatureProvider {
  readonly name: typeof AUDIO_FEATURE_PROVIDER;
  loadForSpotifyTrackIds(spotifyTrackIds: readonly string[]): Promise<AudioFeatureProviderResult>;
}

export type AudioFeatureProviderFailureCode =
  | 'provider_invalid_request'
  | 'rate_limited'
  | 'provider_unavailable'
  | 'provider_invalid_response';

export class AudioFeatureProviderError extends Error {
  constructor(
    public readonly code: AudioFeatureProviderFailureCode,
    public readonly retryAfter: number | null = null,
  ) {
    super('Audio-feature provider request failed.');
    this.name = 'AudioFeatureProviderError';
  }
}
