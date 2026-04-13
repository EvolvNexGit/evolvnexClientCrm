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
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, useClient } from "@/contexts/app-context";
import { Button } from "@/components/ui/button";
import type { TabDefinition } from "@/lib/types";

const SummaryTab = dynamic(() => import("./tabs/summary-tab"), {
  loading: () => <TabLoading />,
});

const AppointmentsTab = dynamic(() => import("./tabs/appointments-tab"), {
  loading: () => <TabLoading />,
});

const BillingCrmTab = dynamic(() => import("./tabs/billing-crm-tab"), {
  loading: () => <TabLoading />,
});

function TabLoading() {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
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
    default:
      return ChevronRight;
  }
}

export function DashboardPage() {
  const router = useRouter();
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

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs]
  );

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
    <div className="min-h-screen bg-background text-text flex">
      {/* Sidebar */}
      <aside className="hidden w-72 border-r border-border bg-card px-5 py-6 xl:flex xl:flex-col">
        <SidebarContent
          tabs={tabs}
          activeTabId={activeTabId}
          setActiveTabId={setActiveTabId}
          onLogout={signOut}
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
              setActiveTabId={setActiveTabId}
              onLogout={signOut}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}

      {/* Main */}
      <main className="flex min-h-screen flex-1 flex-col">
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

            <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
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
        <section className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto flex max-w-6xl flex-col gap-6">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-sm font-medium uppercase tracking-wider text-primary">
                  Dashboard
                </p>
                <h1 className="mt-2 text-3xl font-semibold">
                  {activeTab?.label ?? "Summary"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Client-scoped dashboard with dynamic tab system.
                </p>
              </div>

              <Button onClick={signOut}>
                <span className="inline-flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  Logout
                </span>
              </Button>
            </div>

            {activeTab?.id === "summary" && (
              <SummaryTab clientId={clientId} />
            )}
            {activeTab?.id === "appointments" && (
              <AppointmentsTab clientId={clientId} />
            )}
            {activeTab?.id === "billing-crm" && (
              <BillingCrmTab clientId={clientId} />
            )}
            {!activeTab && <EmptyState />}
          </div>
        </section>
      </main>
    </div>
  );
}

function SidebarContent({
  tabs,
  activeTabId,
  setActiveTabId,
  onLogout,
  onNavigate,
}: {
  tabs: TabDefinition[];
  activeTabId: string;
  setActiveTabId: (tabId: string) => void;
  onLogout: () => Promise<void>;
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* 🔥 LOGO */}
      <div className="mb-8">
        <Image
          src="/logo.png"
          alt="EvolvNex"
          width={140}
          height={40}
          className="object-contain"
        />
      </div>

      <nav className="space-y-2">
        {tabs.map((tab) => {
          const Icon = getTabIcon(tab);
          const isActive = activeTabId === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTabId(tab.id);
                onNavigate?.();
              }}
              className={
                isActive
                  ? "flex w-full items-center gap-3 rounded-xl bg-primary px-4 py-3 text-white shadow-redGlow"
                  : "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-muted-foreground hover:bg-muted hover:text-text"
              }
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1 text-sm font-medium">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-border pt-4">
        <button
          onClick={() => void onLogout()}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-text"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>
      </div>
    </>
  );
}

function DashboardScreenLoader() {
  return (
    <main className="grid min-h-screen place-items-center bg-background px-6">
      <div className="rounded-xl border border-border bg-card px-6 py-5 text-sm text-muted-foreground shadow-soft">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading workspace
        </span>
      </div>
    </main>
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
          <h1 className="text-xl font-semibold">Client not mapped</h1>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {clientError ?? "No client record linked to this user."}
        </p>
        <div className="mt-6 rounded-xl bg-muted p-4 text-xs text-muted-foreground">
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
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
      No tab content available.
    </div>
  );
}