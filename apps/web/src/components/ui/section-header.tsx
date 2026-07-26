import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type SectionHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  id?: string;
  className?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  id,
  className,
}: SectionHeaderProps) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1.5 text-caption font-semibold text-accent-green uppercase">{eyebrow}</p>
        ) : null}
        <h2 id={id} className="text-section-title font-semibold text-text-primary">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-body-sm text-text-secondary">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
