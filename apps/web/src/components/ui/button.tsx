import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

const variantClasses = {
  primary:
    'border-transparent bg-accent-green text-page shadow-card hover:bg-accent-green-strong active:bg-accent-green',
  secondary:
    'border-border-strong bg-surface text-text-primary hover:border-white/20 hover:bg-surface-elevated active:bg-surface',
  ghost:
    'border-transparent bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface',
} as const;

const sizeClasses = {
  sm: 'min-h-9 gap-1.5 px-3 text-body-sm',
  md: 'min-h-11 gap-2 px-4 text-body',
  lg: 'min-h-12 gap-2.5 px-5 text-body',
} as const;

export type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
};

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control border font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-standard ease-standard hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transform-none motion-reduce:transition-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
