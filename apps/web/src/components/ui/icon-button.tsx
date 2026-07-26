import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/cn';

const variantClasses = {
  primary:
    'border-transparent bg-accent-green text-page shadow-card hover:bg-accent-green-strong active:bg-accent-green',
  secondary:
    'border-border-strong bg-surface text-text-secondary hover:border-white/20 hover:bg-surface-elevated hover:text-text-primary active:bg-surface',
  ghost:
    'border-transparent bg-transparent text-text-secondary hover:bg-surface-hover hover:text-text-primary active:bg-surface',
} as const;

const sizeClasses = {
  sm: 'h-11 w-11 [&_svg]:h-4 [&_svg]:w-4',
  md: 'h-12 w-12 [&_svg]:h-5 [&_svg]:w-5',
  lg: 'h-14 w-14 [&_svg]:h-6 [&_svg]:w-6',
} as const;

export type IconButtonProps = Omit<ComponentPropsWithoutRef<'button'>, 'aria-label'> & {
  'aria-label': string;
  variant?: keyof typeof variantClasses;
  size?: keyof typeof sizeClasses;
};

export function IconButton({
  className,
  variant = 'ghost',
  size = 'md',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-control border transition-[background-color,border-color,color,box-shadow,transform] duration-standard ease-standard hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-page active:translate-y-0 disabled:pointer-events-none disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-45 motion-reduce:transform-none motion-reduce:transition-none [&_svg]:shrink-0',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
