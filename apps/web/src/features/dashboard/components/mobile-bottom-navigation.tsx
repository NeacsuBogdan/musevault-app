import { mobileNavigation } from '../data/dashboard';
import { DashboardIcon } from './dashboard-icon';

export function MobileBottomNavigation() {
  return (
    <nav
      aria-label="Mobile dashboard navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border-subtle bg-sidebar/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-elevated backdrop-blur-sm lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {mobileNavigation.map((item) => (
          <li key={item.label}>
            {item.href ? (
              <a
                href={item.href}
                aria-current={item.isActive ? 'page' : undefined}
                aria-label={item.status ? `${item.label} (${item.status})` : undefined}
                className={
                  item.isActive
                    ? 'focus-ring relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-control px-1 font-semibold text-accent-green before:absolute before:top-0 before:h-0.5 before:w-5 before:rounded-pill before:bg-accent-green'
                    : 'focus-ring flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-control px-1 text-text-muted transition-colors duration-fast ease-standard hover:bg-surface-hover hover:text-text-primary'
                }
              >
                <DashboardIcon name={item.icon} size={18} strokeWidth={1.9} />
                <span className="max-w-full truncate text-caption font-medium">{item.label}</span>
                {item.status ? (
                  <span className="text-[0.5625rem] font-semibold uppercase tracking-wide text-text-muted">
                    {item.status}
                  </span>
                ) : null}
              </a>
            ) : (
              <span
                aria-disabled="true"
                className="flex min-h-14 cursor-not-allowed flex-col items-center justify-center gap-0.5 rounded-control px-1 text-text-muted opacity-55"
              >
                <DashboardIcon name={item.icon} size={18} strokeWidth={1.9} />
                <span className="max-w-full truncate text-caption font-medium">{item.label}</span>
                <span className="text-[0.5625rem] font-semibold uppercase tracking-wide">
                  {item.status ?? 'Later'}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
