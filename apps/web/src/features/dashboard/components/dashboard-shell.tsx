import type { DashboardDataState, DashboardProfile } from '../types';
import { DashboardAnalytics } from './dashboard-analytics';
import { DashboardErrorState } from './dashboard-error-state';
import { DashboardHeader } from './dashboard-header';
import { DashboardSidebar } from './dashboard-sidebar';
import { DashboardStatistics } from './dashboard-statistics';
import { DashboardUtilityColumn } from './dashboard-utility-column';
import { MobileBottomNavigation } from './mobile-bottom-navigation';
import { RediscoverSection } from './rediscover-section';

interface DashboardShellProps {
  profile: DashboardProfile;
  state: DashboardDataState;
}

export function DashboardShell({ profile, state }: DashboardShellProps) {
  const loadedTrackCount = state.status === 'success' ? state.viewModel.loadedTrackCount : null;

  return (
    <div className="min-h-screen bg-page text-text-primary">
      <a
        href="#dashboard-main"
        className="fixed left-4 top-4 z-[60] -translate-y-24 rounded-control bg-accent-green px-4 py-2 text-body-sm font-semibold text-page shadow-elevated transition-transform duration-fast ease-standard focus:translate-y-0"
      >
        Skip to dashboard content
      </a>

      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
        <DashboardSidebar
          dataStatus={state.status}
          loadedTrackCount={loadedTrackCount}
          profile={profile}
        />

        <main
          id="dashboard-main"
          tabIndex={-1}
          className="min-w-0 xl:grid xl:grid-cols-[minmax(0,1fr)_19.5rem]"
        >
          <div className="min-w-0 p-page-gutter">
            <div className="space-y-section">
              <DashboardHeader dataStatus={state.status} profile={profile} />
              {state.status === 'success' ? (
                <DashboardStatistics statistics={state.viewModel.statistics} />
              ) : (
                <DashboardErrorState state={state} />
              )}
              <DashboardAnalytics />
              <RediscoverSection />
            </div>
          </div>

          <aside
            aria-label="Recently saved tracks and future library features"
            className="min-w-0 border-t border-border-subtle bg-sidebar/45 p-page-gutter pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-page-gutter xl:border-l xl:border-t-0"
          >
            <DashboardUtilityColumn
              className="grid grid-cols-1 gap-dashboard sm:grid-cols-2 xl:sticky xl:top-0 xl:grid-cols-1"
              recentlySaved={state.status === 'success' ? state.viewModel.recentlySaved : null}
            />
          </aside>
        </main>
      </div>

      <MobileBottomNavigation />
    </div>
  );
}
