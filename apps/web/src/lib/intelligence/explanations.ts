import 'server-only';

import type { EvidenceLevel, IntelligenceReason, RediscoverSignals } from './types';

function savedAgeReason(days: number): string {
  if (days >= 730) return `Saved ${Math.floor(days / 365)}+ years ago`;
  if (days >= 365) return 'Saved 1+ year ago';
  if (days >= 180) return `Saved ${Math.floor(days / 30)}+ months ago`;
  return 'Saved 3+ months ago';
}

function recordedPlayAgeReason(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return `Latest MuseVault-recorded play was ${years} ${years === 1 ? 'year' : 'years'} ago`;
  }
  if (days >= 60) return `Latest MuseVault-recorded play was ${Math.floor(days / 30)} months ago`;
  return `Latest MuseVault-recorded play was ${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function buildRediscoverReasons(
  signals: RediscoverSignals,
  evidenceLevel: EvidenceLevel,
): IntelligenceReason[] {
  const reasons: IntelligenceReason[] = [];

  if (
    signals.latestRecordedPlayAt &&
    signals.daysSinceLatestRecordedPlay !== null &&
    signals.daysSinceLatestRecordedPlay >= 30
  ) {
    reasons.push({
      code: 'recorded_play_recency',
      text: recordedPlayAgeReason(signals.daysSinceLatestRecordedPlay),
      evidenceSource: 'recorded_listening',
    });
  }

  const hasLongerTermAffinity =
    signals.affinity.mediumTerm.rank !== null || signals.affinity.longTerm.rank !== null;
  if (
    hasLongerTermAffinity &&
    signals.affinity.shortTerm.snapshotAvailable &&
    signals.affinity.shortTerm.rank === null
  ) {
    reasons.push({
      code: 'longer_term_affinity_transition',
      text: 'Captured as a longer-term favorite, but not in your latest short-term affinity',
      evidenceSource: 'captured_affinity',
    });
  } else if (signals.affinity.mediumTerm.rank !== null) {
    reasons.push({
      code: 'medium_term_affinity',
      text: 'Appears in your captured medium-term Spotify affinity',
      evidenceSource: 'captured_affinity',
    });
  } else if (signals.affinity.longTerm.rank !== null) {
    reasons.push({
      code: 'long_term_affinity',
      text: 'Appears in your captured long-term Spotify affinity',
      evidenceSource: 'captured_affinity',
    });
  }

  reasons.push({
    code: 'saved_age',
    text: savedAgeReason(signals.savedAgeDays),
    evidenceSource: 'library',
  });

  if (
    reasons.length < 2 &&
    evidenceLevel === 'low' &&
    signals.affinity.shortTerm.snapshotAvailable &&
    signals.affinity.shortTerm.rank === null
  ) {
    reasons.push({
      code: 'outside_short_term_affinity',
      text: 'Not in your latest captured short-term Spotify affinity',
      evidenceSource: 'captured_affinity',
    });
  }

  return reasons.slice(0, 2);
}
