"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import {
  AlertCircle,
  CalendarDays,
  ChevronRight,
  Home,
  Loader2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelRightClose,
  Package,
  Tag,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useApp, useClient } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import { getDashboardTabPath, isDashboardTabPath } from "@/lib/dashboard-tab-routes";
import type { BillingSubTab } from "@/lib/billing-types";
import type { TabDefinition } from "@/lib/types";
import { requestNotificationPermissionOnce } from "@/lib/order-notifications";

const SummaryTab = dynamic(() => import("./tabs/summary-tab"), {
  loading: () => <TabLoading />,
});

const AppointmentsTab = dynamic(() => import("./tabs/appointments-tab"), {
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

function getTabIcon(tab: TabDefinition) {
  switch (tab.icon) {
    case "home":
      return Home;
    case "calendar":
      return CalendarDays;
    case "tag":
      return Tag;
    case "package":
      return Package;
    default:
      return ChevronRight;
  }
}

const STORAGE_KEY = "dashboard-active-tab";
const SCROLL_KEY_PREFIX = "dashboard-scroll-";

function pathMatchesTab(pathname: string, tab: TabDefinition) {
  return isDashboardTabPath(pathname, tab.key);
}

function DashboardPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    loading,
    user,
    authId,
    signOut,
    activeTabId,
    tabs,
    setActiveTabId,
  } = useApp();
  const { clientId, clientError } = useClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pendingTabChangeRef = useRef<string | null>(null);
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

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.key === activeTabId) ?? tabs[0],
    [activeTabId, tabs]
  );

  const resolvedTabFromUrl = useMemo(() => {
    if (!tabs.length) {
      return null;
    }

    const pathTab = tabs.find((tab) => pathMatchesTab(pathname, tab));

    if (pathTab) {
      return pathTab;
    }

    // Priority: URL param > localStorage > first allowed tab
    if (tabFromUrl) {
      const urlTab = tabs.find((tab) => tab.key === tabFromUrl);
      if (urlTab) {
        return urlTab;
      }
    }

    const storedTab = getStoredTab();
    if (storedTab) {
      const stored = tabs.find((tab) => tab.key === storedTab);
      if (stored) {
        return stored;
      }
    }

    return tabs[0] ?? null;
  }, [pathname, tabFromUrl, tabs]);

  const displayTab =
    pendingTabChangeRef.current === activeTabId
      ? activeTab
      : resolvedTabFromUrl ?? activeTab;

  useEffect(() => {
    if (!resolvedTabFromUrl) {
      return;
    }

    const waitingForUrlUpdate =
      pendingTabChangeRef.current === activeTabId && tabFromUrl !== activeTabId;

    if (!waitingForUrlUpdate && activeTabId !== resolvedTabFromUrl.key) {
      setActiveTabId(resolvedTabFromUrl.key);
      setStoredTab(resolvedTabFromUrl.key);
    }

    const canonicalPath = getDashboardTabPath(resolvedTabFromUrl.key);
    if (pathname !== canonicalPath) {
      router.replace(canonicalPath as never, { scroll: false });
      setStoredTab(resolvedTabFromUrl.key);
      pendingTabChangeRef.current = null;
      return;
    }

    if (pendingTabChangeRef.current === resolvedTabFromUrl.key) {
      pendingTabChangeRef.current = null;
    }
  }, [activeTabId, pathname, resolvedTabFromUrl, router, setActiveTabId, tabFromUrl]);

  useEffect(() => {
    if (displayTab?.key) {
      const timer = setTimeout(() => {
        restoreScrollPosition(displayTab.key);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [displayTab?.key]);

  function handleTabChange(tabKey: string) {
    const nextTab = tabs.find((tab) => tab.key === tabKey);

    if (!nextTab || tabKey === activeTabId) {
      return;
    }

    // Save scroll position of current tab
    if (displayTab?.key) {
      saveScrollPosition(displayTab.key);
    }

    pendingTabChangeRef.current = tabKey;
    setActiveTabId(tabKey);
    setStoredTab(tabKey);

    const nextPath = getDashboardTabPath(tabKey);
    router.push(nextPath as never, { scroll: false });
  }

  if (loading || !user) {
    return <DashboardScreenLoader />;
  }

  if (clientError || !clientId) {
    return (
      <ClientFallback
        clientError={clientError}
        authId={authId}
        onLogout={signOut}
      />
    );
  }

  return (
    <div className="h-screen overflow-hidden bg-background text-text flex">
      {/* Sidebar */}
      <aside
        className={
          sidebarCollapsed
            ? "hidden h-full w-20 border-r border-border bg-card px-3 py-6 xl:flex xl:flex-col xl:overflow-y-auto"
            : "hidden h-full w-72 border-r border-border bg-card px-5 py-6 xl:flex xl:flex-col xl:overflow-y-auto"
        }
      >
        <SidebarContent
          tabs={tabs}
          activeTabId={activeTabId}
          onTabChange={handleTabChange}
          onLogout={signOut}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
        />
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 xl:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <aside
            className="absolute inset-y-0 left-0 w-80 max-w-[85vw] border-r border-border bg-card p-5 shadow-soft"
            onClick={(e) => e.stopPropagation()}
          >
            <SidebarContent
              tabs={tabs}
              activeTabId={activeTabId}
              onTabChange={handleTabChange}
              onLogout={signOut}
              onNavigate={() => setMobileOpen(false)}
              collapsed={false}
              onToggleCollapse={() => setSidebarCollapsed((current) => !current)}
            />
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-border bg-background px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 xl:hidden">
              <button
                onClick={() => setMobileOpen(true)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-card text-text"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* 🔥 MOBILE LOGO */}
              <Image
                src="/logo.png"
                alt="EvolvNex"
                width={110}
                height={32}
                className="object-contain"
              />
            </div>

            <div className="ml-auto flex items-center gap-3 text-sm text-muted-foreground">
              <div className="rounded-full border border-border bg-card px-3 py-2">
                Auth ID: {authId ?? "missing"}
              </div>
              <div className="rounded-full border border-border bg-card px-3 py-2">
                Client ID: {clientId}
              </div>
            </div>
          </div>
        </header>

        {/* Content */}
        <section className="flex-1 min-h-0 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8" ref={contentSectionRef}>
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-base font-medium uppercase tracking-wider text-primary">
                  Dashboard
                </p>
                <h1 className="mt-2 text-4xl font-semibold">
                  {displayTab?.displayName ?? displayTab?.label ?? "Summary"}
                </h1>
                <p className="mt-2 max-w-2xl text-base text-muted-foreground">
                  Client-scoped dashboard with dynamic tab system.
                </p>
              </div>
            </div>

            {displayTab?.key === "summary" && (
              <SummaryTab clientId={clientId} />
            )}
            {displayTab?.key === "appointments" && (
              <AppointmentsTab clientId={clientId} />
            )}
            {displayTab?.key === "subscription" && (
              <SubscriptionTab clientId={clientId} />
            )}
            {displayTab?.key === "billing" && (
              <BillingTab clientId={clientId} />
            )}
            {displayTab?.key === "orders" && (
              <OrdersTab clientId={clientId} />
            )}
            {displayTab?.key === "promos" && (
              <PromosTab clientId={clientId} />
            )}
            {displayTab?.key === "ingredients" && (
              <IngredientTab clientId={clientId} />
            )}
            {displayTab?.key === "recipes" && (
              <RecipeTab clientId={clientId} />
            )}
            {(
              displayTab?.key === "customer" ||
              displayTab?.key === "product" ||
              displayTab?.key === "transaction"
            ) && (
              <BillingCrmTab clientId={clientId} activeSubTab={displayTab.key as BillingSubTab} />
            )}
            {!displayTab && <EmptyState />}
          </div>
        </section>
      </main>
    </div>
  );
}

function SidebarContent({
  tabs,
  activeTabId,
  onTabChange,
  onLogout,
  onNavigate,
  collapsed,
  onToggleCollapse,
}: {
  tabs: TabDefinition[];
  activeTabId: string;
  onTabChange: (tabKey: string) => void;
  onLogout: () => Promise<void>;
  onNavigate?: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  return (
    <>
      <div className="mb-8 flex items-center justify-between gap-3">
        <Image
          src="/logo.png"
          alt="EvolvNex"
          width={collapsed ? 40 : 140}
          height={40}
          className="object-contain"
        />
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden rounded-xl border border-border bg-background p-2 text-muted-foreground hover:bg-muted xl:inline-flex"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelRightClose className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="space-y-2">
        {tabs.map((tab) => {
          const Icon = getTabIcon(tab);
          const isActive = activeTabId === tab.key;

          return (
            <div key={tab.key}>
              <button
                onClick={() => {
                  onTabChange(tab.key);
                  onNavigate?.();
                }}
                className={
                  isActive
                    ? "flex w-full items-center gap-3 rounded-xl bg-primary px-4 py-3 text-white shadow-redGlow"
                    : "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-muted-foreground hover:bg-muted hover:text-text"
                }
              >
                <Icon className="h-4 w-4" />
                {!collapsed && <span className="flex-1 text-base font-medium">{tab.displayName ?? tab.label}</span>}
              </button>
            </div>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border pt-4">
        <button
          onClick={() => void onLogout()}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-base font-medium text-muted-foreground hover:bg-muted hover:text-text"
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && "Logout"}
        </button>
      </div>
    </>
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
  authId,
  onLogout,
}: {
  clientError: string | null;
  authId: string | null;
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
        <div className="mt-6 rounded-xl bg-muted p-4 text-sm text-muted-foreground">
          Auth ID: {authId ?? "missing"}
        </div>
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
      No tab content available.
    </div>
  );
}
