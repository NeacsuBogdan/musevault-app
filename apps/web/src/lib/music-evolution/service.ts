import 'server-only';

import { eq } from 'drizzle-orm';

import { withDatabase } from '@/lib/db/client';
import { users } from '@/lib/db/schema';

import type {
  CurrentLibraryAdditions,
  EvolutionHistorySummary,
  EvolutionPeriodDays,
  MusicEvolutionSnapshot,
  SoundEvolution,
} from './contracts';
import { calculateEvolutionEvidenceLevel, evaluateEvolutionAvailability } from './evidence';
import { buildEvolutionPeriodComparison } from './periods';
import {
  CURRENT_LIBRARY_ADDITIONS_DISCLOSURE,
  readArtistMovement,
  readCapturedSoundPeriods,
  readCurrentLibraryAdditions,
  readEvolutionHistory,
  readListeningShift,
  readTrackMovement,
} from './repository';
import { buildSoundEvolution } from './sound';

const EMPTY_HISTORY: EvolutionHistorySummary = {
  capturedHistoryStartedAt: null,
  latestCapturedPlayAt: null,
  latestSuccessfulListeningSyncAt: null,
  current: { capturedEventCount: 0, activeDayCount: 0 },
  previous: { capturedEventCount: 0, activeDayCount: 0 },
};

const EMPTY_ADDITIONS: CurrentLibraryAdditions = {
  current: { count: 0, examples: [] },
  previous: { count: 0, examples: [] },
  disclosure: CURRENT_LIBRARY_ADDITIONS_DISCLOSURE,
};

const COMPARISON_UNAVAILABLE_SOUND: SoundEvolution = {
  available: false,
  reasons: ['COMPARISON_UNAVAILABLE'],
  current: null,
  previous: null,
  movement: null,
  strongestShifts: [],
};

export async function getMusicEvolution(
  spotifyAccountId: string,
  periodDays: EvolutionPeriodDays,
  now = new Date(),
): Promise<MusicEvolutionSnapshot> {
  const period = buildEvolutionPeriodComparison(periodDays, now);

  return withDatabase(async (database) => {
    const [user] = await database
      .select({ id: users.id })
      .from(users)
      .where(eq(users.spotifyAccountId, spotifyAccountId))
      .limit(1);

    if (!user) {
      return {
        period,
        availability: { available: false, reason: 'NO_CAPTURED_HISTORY' },
        evidenceLevel: null,
        history: EMPTY_HISTORY,
        listeningShift: null,
        rotationMovement: null,
        artistMovement: null,
        currentLibraryAdditions: EMPTY_ADDITIONS,
        soundEvolution: COMPARISON_UNAVAILABLE_SOUND,
      };
    }

    const [history, currentLibraryAdditions] = await Promise.all([
      readEvolutionHistory(database, user.id, period),
      readCurrentLibraryAdditions(database, user.id, period),
    ]);
    const availability = evaluateEvolutionAvailability(period, history);
    if (!availability.available) {
      return {
        period,
        availability,
        evidenceLevel: null,
        history,
        listeningShift: null,
        rotationMovement: null,
        artistMovement: null,
        currentLibraryAdditions,
        soundEvolution: COMPARISON_UNAVAILABLE_SOUND,
      };
    }

    const [listeningShift, rotationMovement, artistMovement, soundPeriods] = await Promise.all([
      readListeningShift(database, user.id, period),
      readTrackMovement(database, user.id, period),
      readArtistMovement(database, user.id, period),
      readCapturedSoundPeriods(database, user.id, period),
    ]);

    return {
      period,
      availability,
      evidenceLevel: calculateEvolutionEvidenceLevel(period, history),
      history,
      listeningShift,
      rotationMovement,
      artistMovement,
      currentLibraryAdditions,
      soundEvolution: buildSoundEvolution(soundPeriods.current, soundPeriods.previous),
    };
  });
}
