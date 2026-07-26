import { cn } from '@/lib/cn';

export type ProgressRingProps = {
  value: number;
  size?: number;
  label: string;
  className?: string;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

export function ProgressRing({ value, size = 96, label, className }: ProgressRingProps) {
  const normalizedValue = Number.isFinite(value) ? clamp(value, 0, 100) : 0;
  const resolvedSize = Number.isFinite(size) ? clamp(size, 48, 200) : 96;
  const strokeWidth = Math.max(4, Math.round(resolvedSize * 0.075));
  const center = resolvedSize / 2;
  const radius = (resolvedSize - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - normalizedValue / 100);
  const roundedValue = Math.round(normalizedValue);

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={roundedValue}
      className={cn('relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: resolvedSize, height: resolvedSize }}
    >
      <svg
        width={resolvedSize}
        height={resolvedSize}
        viewBox={`0 0 ${resolvedSize} ${resolvedSize}`}
        aria-hidden="true"
        className="absolute inset-0"
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-border-strong"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${center} ${center})`}
          className="text-accent-green transition-[stroke-dashoffset] duration-slow ease-emphasized motion-reduce:transition-none"
        />
      </svg>
      <span className="text-section-title font-semibold text-text-primary" aria-hidden="true">
        {roundedValue}
        <span className="text-body-sm text-text-muted">%</span>
      </span>
    </div>
  );
}
