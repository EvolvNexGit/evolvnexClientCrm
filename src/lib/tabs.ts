import { getSupabaseClient } from "@/lib/supabase";
import type { TabDefinition } from "@/lib/types";

const tabsCache = new Map<string, TabDefinition[]>();

/** Default sidebar order (tabs not listed appear before Summary / My Profile, by DB display_order). */
export const DEFAULT_TAB_ORDER = [
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
  "summary",
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
export const SUMMARY_DISPLAY_NAME = "My Profile";
export const INGREDIENTS_DISPLAY_NAME = "Inventory";

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
    name: SUMMARY_DISPLAY_NAME,
    label: SUMMARY_DISPLAY_NAME,
    icon: "home",
    route: null,
    permissions: [],
    displayName: SUMMARY_DISPLAY_NAME,
    displayOrder: Number.MAX_SAFE_INTEGER,
    visible: true,
  };
}

/**
 * Always keep the default Summary tab (shown as "My Profile" at the bottom),
 * rename Ingredients → Inventory, and surface specialty analytics as "AI-Analytics".
 */
function applySummaryTabVisibility(tabs: TabDefinition[]): TabDefinition[] {
  const withDisplayLabels = tabs.map((tab) => {
    if (isSpecialtySummaryTab(tab.key)) {
      return {
        ...tab,
        name: SPECIALTY_SUMMARY_DISPLAY_NAME,
        label: SPECIALTY_SUMMARY_DISPLAY_NAME,
        displayName: SPECIALTY_SUMMARY_DISPLAY_NAME,
      };
    }

    if (normalizeTabKey(tab.key) === "summary") {
      return {
        ...tab,
        name: SUMMARY_DISPLAY_NAME,
        label: SUMMARY_DISPLAY_NAME,
        displayName: SUMMARY_DISPLAY_NAME,
      };
    }

    if (normalizeTabKey(tab.key) === "ingredients") {
      return {
        ...tab,
        name: INGREDIENTS_DISPLAY_NAME,
        label: INGREDIENTS_DISPLAY_NAME,
        displayName: INGREDIENTS_DISPLAY_NAME,
      };
    }

    return tab;
  });

  if (!withDisplayLabels.some((tab) => tab.id === "summary" || tab.key === "summary")) {
    return [...withDisplayLabels, createDefaultSummaryTab()];
  }

  return withDisplayLabels;
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
  "013": "doctor-summary",
  "014": "consultation",
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