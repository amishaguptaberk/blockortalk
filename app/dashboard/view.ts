export type DashboardView = 'Home' | 'Leaderboard' | 'Scenarios' | 'News';

export function dashboardView(value: string | undefined): DashboardView {
  return value === 'Leaderboard' || value === 'Scenarios' || value === 'News' ? value : 'Home';
}
