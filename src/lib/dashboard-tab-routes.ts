export const DASHBOARD_TAB_ROUTES: Record<string, string> = {
  summary: "/dashboard",
  appointments: "/dashboard/appointments",
  subscription: "/dashboard/subscription",
  billing: "/dashboard/billing",
  promos: "/dashboard/promos",
  ingredients: "/dashboard/ingredients",
  recipes: "/dashboard/recipes",
  customer: "/dashboard/customer",
  product: "/dashboard/product",
  transaction: "/dashboard/transaction",
};

export function getDashboardTabPath(tabKey: string): string {
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