import { TrendingUp } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';

import { evolutionSnapshot } from '../data/dashboard';
import { accentStrokeClasses, accentTextClasses } from './dashboard-accent';

const CHART_WIDTH = 640;
const CHART_HEIGHT = 196;
const CHART_PADDING_X = 12;
const CHART_PADDING_Y = 14;

interface ChartPoint {
  x: number;
  y: number;
}

function createChartPoints(values: readonly number[]): ChartPoint[] {
  const usableWidth = CHART_WIDTH - CHART_PADDING_X * 2;
  const usableHeight = CHART_HEIGHT - CHART_PADDING_Y * 2;
  const horizontalSteps = Math.max(values.length - 1, 1);

  return values.map((value, index) => ({
    x: CHART_PADDING_X + (index / horizontalSteps) * usableWidth,
    y: CHART_PADDING_Y + ((100 - value) / 100) * usableHeight,
  }));
}

function createLinePath(points: readonly ChartPoint[]): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L';
      return `${command} ${point.x} ${point.y}`;
    })
    .join(' ');
}

function createAreaPath(points: readonly ChartPoint[]): string {
  const firstPoint = points[0];
  const lastPoint = points.at(-1);

  if (!firstPoint || !lastPoint) {
    return '';
  }

  const lineSegments = points.map((point) => `L ${point.x} ${point.y}`).join(' ');

  return `M ${firstPoint.x} ${CHART_HEIGHT} ${lineSegments} L ${lastPoint.x} ${CHART_HEIGHT} Z`;
}

function getHorizontalPosition(index: number, itemCount: number): number {
  const startPosition = (CHART_PADDING_X / CHART_WIDTH) * 100;
  const usableWidth = ((CHART_WIDTH - CHART_PADDING_X * 2) / CHART_WIDTH) * 100;

  return startPosition + (index / Math.max(itemCount - 1, 1)) * usableWidth;
}

export function MusicEvolutionCard() {
  return (
    <Card id="evolution" variant="elevated" padding="lg" className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-card-title font-semibold text-text-primary">Your Music Evolution</h3>
          <p className="mt-1 text-body-sm text-text-secondary">
            How your listening character has shifted
          </p>
        </div>
        <Badge tone="neutral">{evolutionSnapshot.rangeLabel}</Badge>
      </div>

      <figure className="mt-7 min-w-0">
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-auto w-full overflow-visible"
        >
          {[0, 1, 2, 3, 4].map((line) => (
            <line
              key={line}
              x1={CHART_PADDING_X}
              x2={CHART_WIDTH - CHART_PADDING_X}
              y1={CHART_PADDING_Y + line * 42}
              y2={CHART_PADDING_Y + line * 42}
              className="stroke-border-subtle"
              strokeWidth="1"
              strokeDasharray="4 7"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {evolutionSnapshot.series.map((series) => {
            const points = createChartPoints(series.values);

            return (
              <g key={series.label}>
                <path
                  d={createAreaPath(points)}
                  className={`${accentTextClasses[series.accent]} opacity-[0.06]`}
                  fill="currentColor"
                />
                <path
                  d={createLinePath(points)}
                  className={accentStrokeClasses[series.accent]}
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                {points.map((point, index) => (
                  <circle
                    key={`${series.label}-${index}`}
                    cx={point.x}
                    cy={point.y}
                    r="3"
                    className={`${accentStrokeClasses[series.accent]} fill-surface-elevated`}
                    strokeWidth="2"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            );
          })}
        </svg>

        <div aria-hidden="true" className="relative mt-2 h-4 text-caption text-text-muted">
          {evolutionSnapshot.axisLabels.map((label, index) => (
            <span
              key={label}
              className="absolute -translate-x-1/2"
              style={{
                left: `${getHorizontalPosition(index, evolutionSnapshot.axisLabels.length)}%`,
              }}
            >
              {label}
            </span>
          ))}
        </div>

        <figcaption className="mt-5">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {evolutionSnapshot.series.map((series) => (
              <div
                key={series.label}
                className="flex items-center gap-2 text-caption text-text-secondary"
              >
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full bg-current ${accentTextClasses[series.accent]}`}
                />
                <span>{series.label}</span>
                <strong className="font-semibold text-text-primary">
                  {series.values.at(-1) ?? 0}%
                </strong>
              </div>
            ))}
          </div>
          <p className="mt-4 flex items-start gap-2 border-t border-border-subtle pt-4 text-body-sm text-text-secondary">
            <TrendingUp
              aria-hidden="true"
              size={16}
              className="mt-0.5 shrink-0 text-accent-green"
            />
            {evolutionSnapshot.summary}
          </p>
        </figcaption>
      </figure>
    </Card>
  );
}
