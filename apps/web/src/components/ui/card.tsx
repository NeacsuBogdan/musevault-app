import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const variantClasses = {
  default: 'border-border-subtle bg-surface shadow-card',
  elevated: 'border-border-strong bg-surface-elevated shadow-elevated',
  interactive:
    'border-border-subtle bg-surface shadow-card transition-[background-color,border-color,box-shadow,transform] duration-slow ease-emphasized hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface-hover hover:shadow-elevated focus-within:border-border-strong focus-within:ring-2 focus-within:ring-accent-green/70 motion-reduce:transform-none motion-reduce:transition-none',
} as const;

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4 sm:p-5',
  lg: 'p-5 sm:p-6',
} as const;

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: keyof typeof variantClasses;
  padding?: keyof typeof paddingClasses;
};

export function Card({ className, variant = 'default', padding = 'md', ...props }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-card border',
        variantClasses[variant],
        paddingClasses[padding],
        className,
      )}
      {...props}
    />
  );
}
