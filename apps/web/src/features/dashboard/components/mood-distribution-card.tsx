import { Card } from '@/components/ui/card';

import { moodDistribution } from '../data/dashboard';
import { accentStrokeClasses, accentTextClasses } from './dashboard-accent';

function getMoodOffset(index: number): number {
  return moodDistribution.slice(0, index).reduce((total, mood) => total + mood.value, 0);
}

export function MoodDistributionCard() {
  return (
    <Card variant="elevated" padding="lg">
      <div>
        <h3 className="text-card-title font-semibold text-text-primary">Mood Distribution</h3>
        <p className="mt-1 text-body-sm text-text-secondary">The emotional shape of your library</p>
      </div>

      <figure className="mt-7">
        <div className="relative mx-auto grid size-44 place-items-center">
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 120 120"
            className="absolute inset-0 size-full -rotate-90"
          >
            <circle
              cx="60"
              cy="60"
              r="45"
              fill="none"
              className="stroke-border-subtle"
              strokeWidth="16"
            />
            {moodDistribution.map((mood, index) => (
              <circle
                key={mood.label}
                cx="60"
                cy="60"
                r="45"
                pathLength="100"
                fill="none"
                className={accentStrokeClasses[mood.accent]}
                strokeWidth="16"
                strokeDasharray={`${mood.value} ${100 - mood.value}`}
                strokeDashoffset={-getMoodOffset(index)}
              />
            ))}
          </svg>
          <div className="relative text-center">
            <p className="text-section-title font-semibold text-text-primary">Balanced</p>
            <p className="mt-1 text-caption text-text-muted">4 core moods</p>
          </div>
        </div>

        <figcaption className="mt-6">
          <ul className="grid grid-cols-2 gap-x-5 gap-y-3">
            {moodDistribution.map((mood) => (
              <li key={mood.label} className="flex items-center justify-between gap-2 text-body-sm">
                <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full bg-current ${accentTextClasses[mood.accent]}`}
                  />
                  <span className="truncate">{mood.label}</span>
                </span>
                <strong className="font-semibold text-text-primary">{mood.value}%</strong>
              </li>
            ))}
          </ul>
        </figcaption>
      </figure>
    </Card>
  );
}
