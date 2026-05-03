import { getSupabaseClient } from "@/lib/supabase";
import type { TabDefinition } from "@/lib/types";

const tabsCache = new Map<string, TabDefinition[]>();

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

  const key = String(relatedTab.key ?? relatedTab.id ?? "").trim();

  if (!key) {
    return null;
  }

  const name = String(relatedTab.name ?? key);
  const displayName = String(row?.display_name ?? name);
  const displayOrder = Number(row?.display_order ?? 0);

  return {
    id: key,
    key,
    name,
    label: displayName,
    icon: String(relatedTab.icon ?? "chevron"),
    route: relatedTab.route ?? null,
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
      "display_order, permissions, display_name, is_enabled, tabs_info!inner(id, name, key, icon, route, is_active)",
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

  tabsCache.set(clientId, tabs);
  return tabs;
}