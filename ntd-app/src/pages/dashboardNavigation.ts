export const DASHBOARD_TABS = ['Dashboard', 'Screener', 'Analytics', 'Reports'] as const;

export type DashboardTab = (typeof DASHBOARD_TABS)[number];

export const DASHBOARD_PATHS: Record<DashboardTab, string> = {
  Dashboard: '/dashboard',
  Screener: '/screener',
  Analytics: '/analytics',
  Reports: '/reports',
};