import { isSpecialtySummaryTab } from "@/lib/tabs";
import { COMING_SOON_PATH_KEYS, isComingSoonPathKey } from "@/lib/module-navigation";

export const DASHBOARD_TAB_ROUTES: Record<string, string> = {
  // My Profile (no longer the /dashboard home)
  summary: "/dashboard/summary",
  "cafe-summary": "/dashboard/cafe-summary",
  "saloon-summary": "/dashboard/saloon-summary",
  "doctor-summary": "/dashboard/doctor-summary",
  appointments: "/dashboard/appointments",
  consultation: "/dashboard/consultation",
  subscription: "/dashboard/subscription",
  billing: "/dashboard/billing",
  orders: "/dashboard/orders",
  promos: "/dashboard/promos",
  ingredients: "/dashboard/ingredients",
  recipes: "/dashboard/recipes",
  customer: "/dashboard/customer",
  product: "/dashboard/product",
  transaction: "/dashboard/transaction",
  // Coming-soon scaffolding (navigation only)
  reports: "/dashboard/reports",
  "leads-inbox": "/dashboard/leads-inbox",
  "leads-contacts": "/dashboard/leads-contacts",
  "leads-campaigns": "/dashboard/leads-campaigns",
  "leads-templates": "/dashboard/leads-templates",
  "leads-automation": "/dashboard/leads-automation",
  "leads-segments": "/dashboard/leads-segments",
  "hrm-employees": "/dashboard/hrm-employees",
  "hrm-attendance": "/dashboard/hrm-attendance",
  "hrm-leave": "/dashboard/hrm-leave",
  "hrm-payroll": "/dashboard/hrm-payroll",
};

/** Normalize pathname without trailing slash (except root). */
export function normalizeDashboardPath(pathname: string): string {
  return pathname.replace(/\/+$/, "") || "/";
}

export function isDashboardHomePath(pathname: string): boolean {
  return normalizeDashboardPath(pathname) === "/dashboard";
}

export function getDashboardTabPath(tabKey: string): string {
  if (isComingSoonPathKey(tabKey)) {
    return DASHBOARD_TAB_ROUTES[tabKey] ?? `/dashboard/${tabKey}`;
  }

  if (isSpecialtySummaryTab(tabKey) && !(tabKey in DASHBOARD_TAB_ROUTES)) {
    return `/dashboard/${tabKey}`;
  }

  return DASHBOARD_TAB_ROUTES[tabKey] ?? "/dashboard";
}

/**
 * Path used when navigating to AI Insights.
 * Primary insights entry uses the generic /dashboard home URL.
 */
export function getAiInsightsNavPath(tabKey: string, isPrimary: boolean): string {
  if (isPrimary) {
    return "/dashboard";
  }
  return getDashboardTabPath(tabKey);
}

export function isDashboardTabPath(pathname: string, tabKey: string): boolean {
  const currentPath = normalizeDashboardPath(pathname);
  const expectedPath = normalizeDashboardPath(getDashboardTabPath(tabKey));

  if (tabKey === "summary") {
    return currentPath === "/dashboard/summary";
  }

  return currentPath === expectedPath;
}

export function getComingSoonKeyFromPath(pathname: string): string | null {
  const currentPath = normalizeDashboardPath(pathname);
  for (const key of COMING_SOON_PATH_KEYS) {
    if (normalizeDashboardPath(getDashboardTabPath(key)) === currentPath) {
      return key;
    }
  }
  return null;
}
