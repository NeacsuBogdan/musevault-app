import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const toneClasses = {
  neutral: 'border-border-strong bg-white/[0.04] text-text-secondary',
  green: 'border-accent-green/20 bg-accent-green/10 text-accent-green-strong',
  purple: 'border-accent-purple/20 bg-accent-purple/10 text-accent-purple',
  blue: 'border-accent-blue/20 bg-accent-blue/10 text-accent-blue',
  pink: 'border-accent-pink/20 bg-accent-pink/10 text-accent-pink',
  yellow: 'border-accent-yellow/20 bg-accent-yellow/10 text-accent-yellow',
} as const;

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: keyof typeof toneClasses;
};

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-pill border px-2.5 py-0.5 text-caption font-semibold tracking-wide',
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
