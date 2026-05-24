import { getSupabaseClient } from "@/lib/supabase";
import type { TabDefinition } from "@/lib/types";

const tabsCache = new Map<string, TabDefinition[]>();

// Map database tab keys (numeric) to code-based tab keys
const DB_KEY_TO_CODE_KEY: Record<string, string> = {
  "001": "summary",
  "002": "appointments",
  "003": "subscription",
  "004": "billing",
  "005": "ingredients",
  "006": "recipes",
  "007": "customer",
  "008": "product",
  "009": "transaction",
  "010": "promos",
};

function toPermissions(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      return [value];
    }

    return [value];
  }

  return [];
}

function normalizeTab(row: any): TabDefinition | null {
  const relatedTab = Array.isArray(row?.tabs_info) ? row.tabs_info[0] : row?.tabs_info;

  if (!relatedTab) {
    return null;
  }

  const dbKey = String(relatedTab.key ?? relatedTab.id ?? "").trim();

  if (!dbKey) {
    return null;
  }

  // Map database key to code-based key
  const key = DB_KEY_TO_CODE_KEY[dbKey] ?? dbKey;
  const name = String(relatedTab.name ?? dbKey);
  const displayName = String(row?.display_name ?? name);
  const displayOrder = Number(row?.display_order ?? 0);

  return {
    id: key,
    key,
    name,
    label: displayName,
    icon: String(relatedTab.icon ?? "chevron"),
    route: null,
    permissions: toPermissions(row?.permissions),
    displayName,
    displayOrder: Number.isFinite(displayOrder) ? displayOrder : 0,
    visible: Boolean(row?.is_enabled ?? true) && Boolean(relatedTab.is_active ?? true),
  };
}

export async function getTabs(
  clientId: string,
  options?: { forceRefresh?: boolean },
): Promise<TabDefinition[]> {
  if (!options?.forceRefresh && tabsCache.has(clientId)) {
    return tabsCache.get(clientId) ?? [];
  }

  const supabase = getSupabaseClient();

  if (!supabase) {
    tabsCache.set(clientId, []);
    return [];
  }

  const { data, error } = await supabase
    .from("client_tab_access")
    .select(
      "display_order, permissions, display_name, is_enabled, tabs_info!inner(id, name, key, icon, is_active)",
    )
    .eq("client_id", clientId)
    .eq("is_enabled", true)
    .eq("tabs_info.is_active", true)
    .order("display_order", { ascending: true });

  if (error) {
    tabsCache.set(clientId, []);
    return [];
  }

  const tabs = (data ?? [])
    .map((row) => normalizeTab(row))
    .filter((tab): tab is TabDefinition => tab !== null && tab.visible)
    .sort((left, right) => left.displayOrder - right.displayOrder);

  // Ensure "summary" tab is always present and permanent (visible to all clients)
  const hasSummaryTab = tabs.some((tab) => tab.id === "summary");
  if (!hasSummaryTab) {
    const permanentSummaryTab: TabDefinition = {
      id: "summary",
      key: "summary",
      name: "Summary",
      label: "Summary",
      icon: "home",
      route: null,
      permissions: [],
      displayName: "Summary",
      displayOrder: -1, // Ensure it's always first
      visible: true,
    };
    tabs.unshift(permanentSummaryTab);
  }

  tabsCache.set(clientId, tabs);
  return tabs;
}