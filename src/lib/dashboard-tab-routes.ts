import { isHomeSummaryTab, isSpecialtySummaryTab } from "@/lib/tabs";

export const DASHBOARD_TAB_ROUTES: Record<string, string> = {
  summary: "/dashboard",
  "cafe-summary": "/dashboard",
  "saloon-summary": "/dashboard",
  "doctor-summary": "/dashboard",
  appointments: "/dashboard/appointments",
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
  if (isSpecialtySummaryTab(tabKey)) {
    return "/dashboard";
  }

  return DASHBOARD_TAB_ROUTES[tabKey] ?? "/dashboard";
}

export function isDashboardTabPath(pathname: string, tabKey: string): boolean {
  const currentPath = pathname.replace(/\/+$/, "") || "/";
  const expectedPath = getDashboardTabPath(tabKey).replace(/\/+$/, "") || "/";

  if (isHomeSummaryTab(tabKey)) {
    return (
      currentPath === "/dashboard" ||
      currentPath === "/dashboard/summary" ||
      currentPath === `/dashboard/${tabKey}`
    );
  }

  return currentPath === expectedPath;
}
