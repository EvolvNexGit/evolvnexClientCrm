import type { TabDefinition } from "@/lib/types";

const defaultTabs: TabDefinition[] = [
  { id: "summary", label: "Summary", icon: "home", visible: true },
  { id: "appointments", label: "Appointments", icon: "calendar", visible: true },
  { id: "billing-crm", label: "Billling Crm", icon: "chevron", visible: true },
];

const tabsCache = new Map<string, TabDefinition[]>();

export async function getTabs(clientId: string): Promise<TabDefinition[]> {
  if (tabsCache.has(clientId)) {
    return tabsCache.get(clientId) ?? defaultTabs;
  }

  tabsCache.set(clientId, defaultTabs);
  return defaultTabs;
}