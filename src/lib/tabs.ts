import { getSupabaseClient } from "@/lib/supabase";
import type { TabDefinition } from "@/lib/types";

const tabsCache = new Map<string, TabDefinition[]>();

/** Default sidebar order (tabs not listed appear after these, by DB display_order). */
export const DEFAULT_TAB_ORDER = [
  "summary",
  "cafe-summary",
  "saloon-summary",
  "doctor-summary",
  "appointments",
  "billing",
  "transaction",
  "orders",
  "customer",
  "subscription",
  "promos",
  "product",
  "recipes",
  "ingredients",
] as const;

/**
 * Vertical-specific analytics tabs. When enabled for a client they appear as a
 * separate sidebar entry labeled "AI-Analytics" alongside the default Summary tab.
 */
export const SPECIALTY_SUMMARY_TAB_KEYS = [
  "cafe-summary",
  "saloon-summary",
  "doctor-summary",
] as const;

export type SpecialtySummaryTabKey = (typeof SPECIALTY_SUMMARY_TAB_KEYS)[number];

export const SPECIALTY_SUMMARY_DISPLAY_NAME = "AI-Analytics";

export function isSpecialtySummaryTab(key: string): boolean {
  const normalized = normalizeTabKey(key);
  if ((SPECIALTY_SUMMARY_TAB_KEYS as readonly string[]).includes(normalized)) {
    return true;
  }

  return normalized.endsWith("-summary") && normalized !== "summary";
}

/** User-facing / DB aliases → canonical tab keys used in the app. */
const CODE_KEY_ALIASES: Record<string, string> = {
  products: "product",
  product: "product",
  inventory: "ingredients",
  ingredients: "ingredients",
  recipes: "recipes",
  recipies: "recipes",
  promo: "promos",
  promos: "promos",
  order: "orders",
  orders: "orders",
  cafe_summary: "cafe-summary",
  "cafe summary": "cafe-summary",
  saloon_summary: "saloon-summary",
  salon_summary: "saloon-summary",
  "salon-summary": "saloon-summary",
  "saloon summary": "saloon-summary",
  doctor_summary: "doctor-summary",
  "doctor summary": "doctor-summary",
};

function normalizeTabKey(key: string): string {
  const trimmed = key.trim().toLowerCase();
  return CODE_KEY_ALIASES[trimmed] ?? trimmed;
}

function getDefaultTabRank(key: string): number {
  const normalized = normalizeTabKey(key);
  const index = DEFAULT_TAB_ORDER.indexOf(normalized as (typeof DEFAULT_TAB_ORDER)[number]);
  return index === -1 ? DEFAULT_TAB_ORDER.length : index;
}

function sortTabsByDefaultOrder(tabs: TabDefinition[]): TabDefinition[] {
  return [...tabs].sort((left, right) => {
    const rankDiff = getDefaultTabRank(left.key) - getDefaultTabRank(right.key);
    if (rankDiff !== 0) {
      return rankDiff;
    }

    return left.displayOrder - right.displayOrder;
  });
}

function createDefaultSummaryTab(): TabDefinition {
  return {
    id: "summary",
    key: "summary",
    name: "Summary",
    label: "Summary",
    icon: "home",
    route: null,
    permissions: [],
    displayName: "Summary",
    displayOrder: 0,
    visible: true,
  };
}

/**
 * Always keep the default Summary tab, and surface specialty analytics tabs
 * (cafe / saloon / doctor / …) as a separate "AI-Analytics" entry when enabled.
 */
function applySummaryTabVisibility(tabs: TabDefinition[]): TabDefinition[] {
  const withSpecialtyLabels = tabs.map((tab) =>
    isSpecialtySummaryTab(tab.key)
      ? {
          ...tab,
          name: SPECIALTY_SUMMARY_DISPLAY_NAME,
          label: SPECIALTY_SUMMARY_DISPLAY_NAME,
          displayName: SPECIALTY_SUMMARY_DISPLAY_NAME,
        }
      : tab,
  );

  if (!withSpecialtyLabels.some((tab) => tab.id === "summary")) {
    return [createDefaultSummaryTab(), ...withSpecialtyLabels];
  }

  return withSpecialtyLabels;
}

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
  "011": "orders",
  "012": "cafe-summary",
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

function resolveCodeKey(dbKey: string, name: string): string {
  const mappedFromDb = DB_KEY_TO_CODE_KEY[dbKey] ?? dbKey;
  const keyFromDb = normalizeTabKey(mappedFromDb);

  if (isSpecialtySummaryTab(keyFromDb) || keyFromDb === "summary") {
    return keyFromDb;
  }

  // If DB used a numeric/custom key, recover specialty summaries from the tab name
  // e.g. key "012" + name "Cafe Summary" → "cafe-summary"
  const nameAsKey = normalizeTabKey(name.replace(/[_\s]+/g, "-"));
  if (isSpecialtySummaryTab(nameAsKey)) {
    return nameAsKey;
  }

  const nameAlias = normalizeTabKey(name);
  if (isSpecialtySummaryTab(nameAlias)) {
    return nameAlias;
  }

  return keyFromDb;
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

  const name = String(relatedTab.name ?? dbKey);
  const key = resolveCodeKey(dbKey, name);
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
    .order("display_order", { ascending: true });

  if (error) {
    tabsCache.set(clientId, []);
    return [];
  }

  let tabs = (data ?? [])
    .map((row) => normalizeTab(row))
    .filter((tab): tab is TabDefinition => tab !== null && tab.visible);

  tabs = applySummaryTabVisibility(tabs);
  tabs = sortTabsByDefaultOrder(tabs);

  tabsCache.set(clientId, tabs);
  return tabs;
}