import Dashboard from './Dashboard';
import { dashboardView } from './view';

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  return <Dashboard initialView={dashboardView(view)} />;
}
