import { isSpecialtySummaryTab } from "@/lib/tabs";

export const DASHBOARD_TAB_ROUTES: Record<string, string> = {
  summary: "/dashboard",
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
};

export function getDashboardTabPath(tabKey: string): string {
  if (isSpecialtySummaryTab(tabKey) && !(tabKey in DASHBOARD_TAB_ROUTES)) {
    return `/dashboard/${tabKey}`;
  }

  return DASHBOARD_TAB_ROUTES[tabKey] ?? "/dashboard";
}

export function isDashboardTabPath(pathname: string, tabKey: string): boolean {
  const currentPath = pathname.replace(/\/+$/, "") || "/";
  const expectedPath = getDashboardTabPath(tabKey).replace(/\/+$/, "") || "/";

  if (tabKey === "summary") {
    return currentPath === "/dashboard" || currentPath === "/dashboard/summary";
  }

  return currentPath === expectedPath;
}
