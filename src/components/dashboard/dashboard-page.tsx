"use client";

import dynamic from "next/dynamic";
import {
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp, useClient } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { TopNavigation } from "@/components/dashboard/top-navigation";
import { DynamicSidebar } from "@/components/dashboard/dynamic-sidebar";
import { MobileDrawer } from "@/components/dashboard/mobile-drawer";
import {
  getAiInsightsNavPath,
  getComingSoonKeyFromPath,
  getDashboardTabPath,
  isDashboardHomePath,
  isDashboardTabPath,
} from "@/lib/dashboard-tab-routes";
import type { BillingSubTab } from "@/lib/billing-types";
import { requestNotificationPermissionOnce } from "@/lib/order-notifications";
import { isSpecialtySummaryTab } from "@/lib/tabs";
import {
  getComingSoonItem,
  getDefaultApplicationTab,
  getDefaultModuleId,
  getModuleIdForNavKey,
  getSidebarItemsForModule,
  isComingSoonPathKey,
  MODULES,
  type ModuleId,
  type ResolvedSidebarItem,
} from "@/lib/module-navigation";

function TabLoading() {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-border bg-card text-base text-muted-foreground">
      <span className="inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading tab content
      </span>
    </div>
  );
}

const SummaryTab = dynamic(() => import("./tabs/summary-tab"), {
  loading: () => <TabLoading />,
});

const CafeSummaryTab = dynamic(() => import("./tabs/cafe-summary-tab"), {
  loading: () => <TabLoading />,
});

const DoctorSummaryTab = dynamic(() => import("./tabs/doctor-summary-tab"), {
  loading: () => <TabLoading />,
});

const AppointmentsTab = dynamic(() => import("./tabs/appointments-tab"), {
  loading: () => <TabLoading />,
});

const ConsultationTab = dynamic(() => import("./tabs/consultation-tab"), {
  loading: () => <TabLoading />,
});

const SubscriptionTab = dynamic(() => import("./tabs/subscription-tab"), {
  loading: () => <TabLoading />,
});

const BillingTab = dynamic(() => import("./tabs/billing-tab"), {
  loading: () => <TabLoading />,
});

const IngredientTab = dynamic(() => import("./tabs/ingredient-tab"), {
  loading: () => <TabLoading />,
});

const RecipeTab = dynamic(() => import("./tabs/recipe-tab"), {
  loading: () => <TabLoading />,
});

const BillingCrmTab = dynamic(() => import("./tabs/billing-crm-tab"), {
  loading: () => <TabLoading />,
});

const PromosTab = dynamic(() => import("./tabs/promos-tab"), {
  loading: () => <TabLoading />,
});

const OrdersTab = dynamic(() => import("./tabs/orders-tab"), {
  loading: () => <TabLoading />,
});

const ContactsTab = dynamic(() => import("./tabs/contacts-tab"), {
  loading: () => <TabLoading />,
});

const WhatsAppAutoReplyTab = dynamic(() => import("./tabs/whatsapp-auto-reply-tab"), {
  loading: () => <TabLoading />,
});

const ComingSoonTab = dynamic(() => import("./coming-soon-tab"), {
  loading: () => <TabLoading />,
});

const STORAGE_KEY = "dashboard-active-tab";
const MODULE_STORAGE_KEY = "dashboard-active-module";

function pathMatchesTab(pathname: string, tabKey: string) {
  return isDashboardTabPath(pathname, tabKey);
}

type ResolvedView =
  | { type: "tab"; key: string }
  | { type: "coming-soon"; key: string }
  | { type: "empty" };

function DashboardPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    loading,
    user,
    signOut,
    activeTabId,
    tabs,
    setActiveTabId,
  } = useApp();
  const { clientId, clientError } = useClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeModuleId, setActiveModuleId] = useState<ModuleId>("ai-analytics");
  const pendingNavKeyRef = useRef<string | null>(null);
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const contentSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (loading || !user) {
      return;
    }

    requestNotificationPermissionOnce();
  }, [loading, user]);

  useEffect(() => {
    if (!mobileOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    }

    document.addEventListener("keydown", handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
    };
  }, [mobileOpen]);

  const tabFromUrl = searchParams.get("tab");

  const getStoredTab = (): string | null => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const setStoredTab = (tabKey: string): void => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, tabKey);
    } catch {
      // Silently fail if localStorage is unavailable
    }
  };

  const getStoredModule = (): ModuleId | null => {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const value = localStorage.getItem(MODULE_STORAGE_KEY);
      if (
        value === "ai-analytics" ||
        value === "crm" ||
        value === "pos" ||
        value === "leads" ||
        value === "hrm"
      ) {
        return value;
      }
      return null;
    } catch {
      return null;
    }
  };

  const setStoredModule = (moduleId: ModuleId): void => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      localStorage.setItem(MODULE_STORAGE_KEY, moduleId);
    } catch {
      // Silently fail if localStorage is unavailable
    }
  };

  const saveScrollPosition = (tabKey: string): void => {
    if (contentSectionRef.current) {
      scrollPositionsRef.current[tabKey] = contentSectionRef.current.scrollTop;
    }
  };

  const restoreScrollPosition = (tabKey: string): void => {
    if (contentSectionRef.current && tabKey in scrollPositionsRef.current) {
      contentSectionRef.current.scrollTop = scrollPositionsRef.current[tabKey];
    }
  };

  const visibleModuleIds = useMemo(
    () => MODULES.map((module) => module.id),
    [],
  );

  const defaultTab = useMemo(() => getDefaultApplicationTab(tabs), [tabs]);

  const resolvedView = useMemo((): ResolvedView => {
    const comingSoonKey = getComingSoonKeyFromPath(pathname);
    if (comingSoonKey) {
      return { type: "coming-soon", key: comingSoonKey };
    }

    if (isDashboardHomePath(pathname)) {
      // Honor legacy ?tab= on /dashboard (e.g. ?tab=summary → My Profile redirect)
      if (tabFromUrl) {
        if (isComingSoonPathKey(tabFromUrl)) {
          return { type: "coming-soon", key: tabFromUrl };
        }
        const urlTab = tabs.find((tab) => tab.key === tabFromUrl);
        if (urlTab) {
          return { type: "tab", key: urlTab.key };
        }
      }

      if (defaultTab) {
        return { type: "tab", key: defaultTab.key };
      }
      return { type: "empty" };
    }

    const pathTab = tabs.find((tab) => pathMatchesTab(pathname, tab.key));
    if (pathTab) {
      return { type: "tab", key: pathTab.key };
    }

    if (tabFromUrl) {
      if (isComingSoonPathKey(tabFromUrl)) {
        return { type: "coming-soon", key: tabFromUrl };
      }
      const urlTab = tabs.find((tab) => tab.key === tabFromUrl);
      if (urlTab) {
        return { type: "tab", key: urlTab.key };
      }
    }

    const storedTab = getStoredTab();
    if (storedTab) {
      if (isComingSoonPathKey(storedTab)) {
        return { type: "coming-soon", key: storedTab };
      }
      const stored = tabs.find((tab) => tab.key === storedTab);
      if (stored) {
        return { type: "tab", key: stored.key };
      }
    }

    if (defaultTab) {
      return { type: "tab", key: defaultTab.key };
    }

    return { type: "empty" };
  }, [pathname, tabFromUrl, tabs, defaultTab]);

  const activeNavKey =
    pendingNavKeyRef.current ??
    (resolvedView.type === "empty" ? null : resolvedView.key);

  const displayTabKey = resolvedView.type === "tab" ? resolvedView.key : null;
  const comingSoonKey = resolvedView.type === "coming-soon" ? resolvedView.key : null;

  const sidebarItems = useMemo(
    () => getSidebarItemsForModule(activeModuleId, tabs),
    [activeModuleId, tabs],
  );

  // Sync active module from resolved view / storage
  useEffect(() => {
    if (!tabs.length && visibleModuleIds.length === 0) {
      return;
    }

    if (resolvedView.type === "tab" || resolvedView.type === "coming-soon") {
      const moduleFromNav = getModuleIdForNavKey(resolvedView.key);
      if (moduleFromNav && visibleModuleIds.includes(moduleFromNav)) {
        setActiveModuleId(moduleFromNav);
        setStoredModule(moduleFromNav);
        return;
      }
    }

    if (resolvedView.type === "tab" && resolvedView.key === "summary") {
      const storedModule = getStoredModule();
      if (storedModule && visibleModuleIds.includes(storedModule)) {
        setActiveModuleId(storedModule);
        return;
      }
    }

    const fallback = getDefaultModuleId(tabs);
    const nextModule = visibleModuleIds.includes(fallback)
      ? fallback
      : visibleModuleIds[0] ?? "ai-analytics";
    setActiveModuleId(nextModule);
    setStoredModule(nextModule);
  }, [resolvedView, tabs, visibleModuleIds]);

  // Sync URL + active tab id for real tabs / coming-soon views
  useEffect(() => {
    if (resolvedView.type === "coming-soon") {
      const canonicalPath = getDashboardTabPath(resolvedView.key);
      if (pathname !== canonicalPath) {
        router.replace(canonicalPath as never, { scroll: false });
      }
      setStoredTab(resolvedView.key);
      if (pendingNavKeyRef.current === resolvedView.key) {
        pendingNavKeyRef.current = null;
      }
      return;
    }

    if (resolvedView.type !== "tab") {
      return;
    }

    const tabKey = resolvedView.key;

    if (activeTabId !== tabKey) {
      setActiveTabId(tabKey);
      setStoredTab(tabKey);
    }

    const isPrimaryInsights =
      Boolean(defaultTab?.key === tabKey && isSpecialtySummaryTab(tabKey));

    // Home URL stays on /dashboard when showing primary AI Insights
    if (isDashboardHomePath(pathname)) {
      if (isPrimaryInsights) {
        if (pendingNavKeyRef.current === tabKey) {
          pendingNavKeyRef.current = null;
        }
        return;
      }

      // No AI Insights available — send user to first permitted application tab
      if (defaultTab) {
        const nextPath = getDashboardTabPath(defaultTab.key);
        if (pathname !== nextPath) {
          router.replace(nextPath as never, { scroll: false });
        }
      }
      return;
    }

    // Specialty deep-links (/dashboard/cafe-summary etc.) are already valid
    if (isSpecialtySummaryTab(tabKey) && pathMatchesTab(pathname, tabKey)) {
      if (pendingNavKeyRef.current === tabKey) {
        pendingNavKeyRef.current = null;
      }
      return;
    }

    const canonicalPath = getDashboardTabPath(tabKey);
    if (pathname !== canonicalPath) {
      router.replace(canonicalPath as never, { scroll: false });
      setStoredTab(tabKey);
      pendingNavKeyRef.current = null;
      return;
    }

    if (pendingNavKeyRef.current === tabKey) {
      pendingNavKeyRef.current = null;
    }
  }, [activeTabId, defaultTab, pathname, resolvedView, router, setActiveTabId]);

  useEffect(() => {
    if (activeNavKey) {
      const timer = setTimeout(() => {
        restoreScrollPosition(activeNavKey);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeNavKey]);

  function navigateToKey(navKey: string, options?: { aiInsightsPrimary?: boolean }) {
    if (navKey === activeNavKey && !isDashboardHomePath(pathname)) {
      return;
    }

    if (activeNavKey) {
      saveScrollPosition(activeNavKey);
    }

    pendingNavKeyRef.current = navKey;
    setStoredTab(navKey);

    if (isComingSoonPathKey(navKey)) {
      router.push(getDashboardTabPath(navKey) as never, { scroll: false });
      return;
    }

    setActiveTabId(navKey);

    const nextPath = options?.aiInsightsPrimary
      ? getAiInsightsNavPath(navKey, true)
      : isSpecialtySummaryTab(navKey) && defaultTab?.key === navKey
        ? getAiInsightsNavPath(navKey, true)
        : getDashboardTabPath(navKey);

    router.push(nextPath as never, { scroll: false });
  }

  function handleSidebarItemSelect(item: ResolvedSidebarItem) {
    navigateToKey(item.navKey, {
      aiInsightsPrimary: item.kind === "ai-insights" && Boolean(item.isPrimaryAiInsights),
    });
  }

  function handleModuleChange(moduleId: ModuleId) {
    setActiveModuleId(moduleId);
    setStoredModule(moduleId);

    const items = getSidebarItemsForModule(moduleId, tabs);
    const first = items[0];
    if (!first) {
      return;
    }

    navigateToKey(first.navKey, {
      aiInsightsPrimary: first.kind === "ai-insights" && Boolean(first.isPrimaryAiInsights),
    });
  }

  function handleMobileModuleChange(moduleId: ModuleId) {
    handleModuleChange(moduleId);
    setMobileOpen(false);
  }

  function handleMobileItemSelect(item: ResolvedSidebarItem) {
    handleSidebarItemSelect(item);
    setMobileOpen(false);
  }

  function handleOpenProfile() {
    navigateToKey("summary");
  }

  function handleMobileOpenProfile() {
    handleOpenProfile();
    setMobileOpen(false);
  }

  const userLabel =
    (typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
    user?.email?.split("@")[0] ||
    "Account";

  if (loading || !user) {
    return <DashboardScreenLoader />;
  }

  if (clientError || !clientId) {
    return (
      <ClientFallback
        clientError={clientError}
        onLogout={signOut}
      />
    );
  }

  const comingSoonMeta = comingSoonKey ? getComingSoonItem(comingSoonKey) : undefined;

  return (
    <div className="flex h-dvh max-h-dvh min-w-0 flex-col overflow-hidden bg-background text-text">
      <TopNavigation
        activeModuleId={activeModuleId}
        visibleModuleIds={visibleModuleIds}
        onModuleChange={handleModuleChange}
        onOpenMobileSidebar={() => setMobileOpen(true)}
        onOpenProfile={handleOpenProfile}
        onLogout={signOut}
        userLabel={userLabel}
      />

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <aside
          className={
            sidebarCollapsed
              ? "hidden h-full w-20 shrink-0 border-r border-border bg-card px-3 py-5 xl:flex xl:flex-col xl:overflow-y-auto"
              : "hidden h-full w-64 shrink-0 border-r border-border bg-card px-4 py-5 xl:flex xl:flex-col xl:overflow-y-auto"
          }
        >
          <DynamicSidebar
            moduleId={activeModuleId}
            items={sidebarItems}
            activeNavKey={displayTabKey === "summary" ? null : activeNavKey}
            collapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
            onItemSelect={handleSidebarItemSelect}
          />
        </aside>

        <MobileDrawer
          open={mobileOpen}
          activeModuleId={activeModuleId}
          visibleModuleIds={visibleModuleIds}
          items={sidebarItems}
          activeNavKey={displayTabKey === "summary" ? null : activeNavKey}
          onClose={() => setMobileOpen(false)}
          onModuleChange={handleMobileModuleChange}
          onItemSelect={handleMobileItemSelect}
          onOpenProfile={handleMobileOpenProfile}
          onLogout={signOut}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <section
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-6 pt-6 sm:px-6 sm:pt-8 lg:px-8"
            ref={contentSectionRef}
          >
            <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-6">
              {displayTabKey === "summary" && <SummaryTab clientId={clientId} />}
              {displayTabKey === "cafe-summary" && <CafeSummaryTab clientId={clientId} />}
              {displayTabKey === "doctor-summary" && <DoctorSummaryTab clientId={clientId} />}
              {displayTabKey &&
                isSpecialtySummaryTab(displayTabKey) &&
                displayTabKey !== "cafe-summary" &&
                displayTabKey !== "doctor-summary" && (
                  <ComingSoonTab
                    title="AI Insights"
                    description="This AI Insights view is enabled for your account, but its page is not available in this build yet."
                  />
                )}
              {displayTabKey === "appointments" && <AppointmentsTab clientId={clientId} />}
              {displayTabKey === "consultation" && <ConsultationTab clientId={clientId} />}
              {displayTabKey === "subscription" && <SubscriptionTab clientId={clientId} />}
              {displayTabKey === "billing" && <BillingTab clientId={clientId} />}
              {displayTabKey === "orders" && <OrdersTab clientId={clientId} />}
              {displayTabKey === "promos" && <PromosTab clientId={clientId} />}
              {displayTabKey === "ingredients" && <IngredientTab clientId={clientId} />}
              {displayTabKey === "recipes" && <RecipeTab clientId={clientId} />}
              {(
                displayTabKey === "customer" ||
                displayTabKey === "product" ||
                displayTabKey === "transaction"
              ) && (
                <BillingCrmTab
                  clientId={clientId}
                  activeSubTab={displayTabKey as BillingSubTab}
                />
              )}
              {comingSoonKey === "leads-automation" && <WhatsAppAutoReplyTab clientId={clientId} />}
              {comingSoonKey === "leads-contacts" && <ContactsTab clientId={clientId} />}
              {comingSoonKey &&
                comingSoonKey !== "leads-automation" &&
                comingSoonKey !== "leads-contacts" && (
                <ComingSoonTab title={comingSoonMeta?.label ?? "Coming Soon"} />
              )}
              {resolvedView.type === "empty" && <EmptyState />}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export function DashboardScreenLoader() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="rounded-xl border border-border bg-card px-6 py-5 text-base text-muted-foreground shadow-soft">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading workspace
        </span>
      </div>
    </main>
  );
}

export function DashboardPage() {
  return (
    <Suspense fallback={<DashboardScreenLoader />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function ClientFallback({
  clientError,
  onLogout,
}: {
  clientError: string | null;
  onLogout: () => Promise<void>;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 shadow-soft">
        <div className="flex items-center gap-3 text-primary">
          <AlertCircle className="h-5 w-5" />
          <h1 className="text-2xl font-semibold">Client not mapped</h1>
        </div>
        <p className="mt-4 text-base text-muted-foreground">
          {clientError ?? "No client record linked to this user."}
        </p>
        <div className="mt-6">
          <Button onClick={() => void onLogout()}>Logout</Button>
        </div>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-base text-muted-foreground">
      No tab content available for this account.
    </div>
  );
}
