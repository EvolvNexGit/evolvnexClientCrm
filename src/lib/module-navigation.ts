import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Calendar,
  ClipboardList,
  Contact,
  CreditCard,
  FileText,
  Inbox,
  Layers,
  LayoutDashboard,
  Megaphone,
  Package,
  Plane,
  Receipt,
  ShoppingBag,
  Sparkles,
  Tag,
  Users,
  Wallet,
  Workflow,
  ConciergeBell,
  ChefHat,
  UserRound,
  CalendarDays,
  Settings,
} from "lucide-react";
import { isSpecialtySummaryTab } from "@/lib/tabs";
import type { TabDefinition } from "@/lib/types";

export type ModuleId = "ai-analytics" | "crm" | "pos" | "leads" | "hrm";

export type NavItemKind = "existing-tab" | "ai-insights" | "coming-soon";

export type ModuleNavItemConfig = {
  id: string;
  label: string;
  kind: NavItemKind;
  /** Existing dashboard tab key (for kind === "existing-tab"). */
  tabKey?: string;
  /** Stable path segment / virtual tab key (for kind === "coming-soon"). */
  pathKey?: string;
  icon: LucideIcon;
};

export type ModuleConfig = {
  id: ModuleId;
  label: string;
  items: ModuleNavItemConfig[];
};

/** Top-level modules and their contextual sidebar items (presentation layer only). */
export const MODULES: ModuleConfig[] = [
  {
    id: "ai-analytics",
    label: "AI Analytics",
    items: [
      {
        id: "ai-insights",
        label: "AI Insights",
        kind: "ai-insights",
        icon: Sparkles,
      },
      {
        id: "reports",
        label: "Reports",
        kind: "coming-soon",
        pathKey: "reports",
        icon: BarChart3,
      },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    items: [
      { id: "customers", label: "Customers", kind: "existing-tab", tabKey: "customer", icon: Users },
      { id: "appointments", label: "Appointments", kind: "existing-tab", tabKey: "appointments", icon: Calendar },
      { id: "consultations", label: "Consultations", kind: "existing-tab", tabKey: "consultation", icon: FileText },
      { id: "subscriptions", label: "Subscriptions", kind: "existing-tab", tabKey: "subscription", icon: CreditCard },
    ],
  },
  {
    id: "pos",
    label: "POS",
    items: [
      { id: "billing", label: "Billing", kind: "existing-tab", tabKey: "billing", icon: ShoppingBag },
      { id: "orders", label: "Orders", kind: "existing-tab", tabKey: "orders", icon: ConciergeBell },
      { id: "products", label: "Products", kind: "existing-tab", tabKey: "product", icon: Package },
      { id: "inventory", label: "Inventory", kind: "existing-tab", tabKey: "ingredients", icon: ClipboardList },
      { id: "recipes", label: "Recipes", kind: "existing-tab", tabKey: "recipes", icon: ChefHat },
      { id: "promos", label: "Promos", kind: "existing-tab", tabKey: "promos", icon: Tag },
      { id: "transactions", label: "Transactions", kind: "existing-tab", tabKey: "transaction", icon: Receipt },
    ],
  },
  {
    id: "leads",
    label: "LEADS",
    items: [
      { id: "inbox", label: "Inbox", kind: "coming-soon", pathKey: "leads-inbox", icon: Inbox },
      { id: "contacts", label: "Contacts", kind: "coming-soon", pathKey: "leads-contacts", icon: Contact },
      { id: "campaigns", label: "Campaigns", kind: "coming-soon", pathKey: "leads-campaigns", icon: Megaphone },
      { id: "templates", label: "Templates", kind: "coming-soon", pathKey: "leads-templates", icon: Layers },
      { id: "whatsapp-settings", label: "WhatsApp Settings", kind: "coming-soon", pathKey: "leads-whatsapp-settings", icon: Settings },
      { id: "automation", label: "Auto Replies", kind: "coming-soon", pathKey: "leads-automation", icon: Workflow },
      { id: "segments", label: "Segments", kind: "coming-soon", pathKey: "leads-segments", icon: LayoutDashboard },
    ],
  },
  {
    id: "hrm",
    label: "HRM",
    items: [
      { id: "employees", label: "Employees", kind: "coming-soon", pathKey: "hrm-employees", icon: UserRound },
      { id: "attendance", label: "Attendance", kind: "coming-soon", pathKey: "hrm-attendance", icon: CalendarDays },
      { id: "leave", label: "Leave", kind: "coming-soon", pathKey: "hrm-leave", icon: Plane },
      { id: "payroll", label: "Payroll", kind: "coming-soon", pathKey: "hrm-payroll", icon: Wallet },
    ],
  },
];

export const COMING_SOON_PATH_KEYS = MODULES.flatMap((module) =>
  module.items
    .filter((item) => item.kind === "coming-soon" && item.pathKey)
    .map((item) => item.pathKey as string),
);

export function isComingSoonPathKey(key: string): boolean {
  return COMING_SOON_PATH_KEYS.includes(key);
}

export function getComingSoonItem(pathKey: string): ModuleNavItemConfig | undefined {
  for (const module of MODULES) {
    const match = module.items.find((item) => item.kind === "coming-soon" && item.pathKey === pathKey);
    if (match) {
      return match;
    }
  }
  return undefined;
}

export function getModuleById(moduleId: ModuleId): ModuleConfig | undefined {
  return MODULES.find((module) => module.id === moduleId);
}

/** Permitted specialty / AI Insights tabs from the existing tab-access system. */
export function getAiInsightsTabs(tabs: TabDefinition[]): TabDefinition[] {
  return tabs.filter((tab) => isSpecialtySummaryTab(tab.key));
}

/**
 * Default landing tab: AI Insights when available, otherwise first permitted
 * application tab (excluding My Profile).
 */
export function getDefaultApplicationTab(tabs: TabDefinition[]): TabDefinition | null {
  const insights = getAiInsightsTabs(tabs);
  if (insights[0]) {
    return insights[0];
  }

  const applicationTab = tabs.find((tab) => tab.key !== "summary");
  return applicationTab ?? null;
}

export type ResolvedSidebarItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  kind: NavItemKind;
  /** Real tab key or coming-soon path key used for routing / active state. */
  navKey: string;
  /** Whether this is the primary AI Insights entry (maps to /dashboard). */
  isPrimaryAiInsights?: boolean;
};

/**
 * Build sidebar items for a module, filtering existing tabs by client_tab_access.
 * AI Insights is a single generic nav item; the permitted specialty summary tab
 * from tab-access determines which content implementation is shown.
 * Coming-soon items are always shown (navigation scaffolding).
 */
export function getSidebarItemsForModule(
  moduleId: ModuleId,
  tabs: TabDefinition[],
): ResolvedSidebarItem[] {
  const module = getModuleById(moduleId);
  if (!module) {
    return [];
  }

  const items: ResolvedSidebarItem[] = [];

  for (const config of module.items) {
    if (config.kind === "ai-insights") {
      const insightsTabs = getAiInsightsTabs(tabs);
      const primary = insightsTabs[0];
      if (!primary) {
        continue;
      }

      // One generic "AI Insights" nav item. Which specialty summary content
      // renders is determined by the permitted tab from client_tab_access.
      items.push({
        id: config.id,
        label: config.label,
        icon: config.icon,
        kind: "ai-insights",
        navKey: primary.key,
        isPrimaryAiInsights: true,
      });
      continue;
    }

    if (config.kind === "existing-tab") {
      const tabKey = config.tabKey;
      if (!tabKey) {
        continue;
      }
      const permitted = tabs.some((tab) => tab.key === tabKey);
      if (!permitted) {
        continue;
      }
      items.push({
        id: config.id,
        label: config.label,
        icon: config.icon,
        kind: "existing-tab",
        navKey: tabKey,
      });
      continue;
    }

    if (config.kind === "coming-soon" && config.pathKey) {
      items.push({
        id: config.id,
        label: config.label,
        icon: config.icon,
        kind: "coming-soon",
        navKey: config.pathKey,
      });
    }
  }

  return items;
}

export function getModuleIdForNavKey(navKey: string): ModuleId | null {
  if (isSpecialtySummaryTab(navKey)) {
    return "ai-analytics";
  }

  if (navKey === "summary") {
    return null;
  }

  for (const module of MODULES) {
    for (const item of module.items) {
      if (item.kind === "existing-tab" && item.tabKey === navKey) {
        return module.id;
      }
      if (item.kind === "coming-soon" && item.pathKey === navKey) {
        return module.id;
      }
    }
  }

  return null;
}

export function getDefaultModuleId(tabs: TabDefinition[]): ModuleId {
  const defaultTab = getDefaultApplicationTab(tabs);
  if (defaultTab) {
    return getModuleIdForNavKey(defaultTab.key) ?? "ai-analytics";
  }
  return "ai-analytics";
}
