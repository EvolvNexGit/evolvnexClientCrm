"use client";

import dynamic from "next/dynamic";
import { AlertCircle, CalendarDays, ChevronRight, Home, Loader2, LogOut, Menu } from "lucide-react";
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

function TabLoading() {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm text-slate-500">
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
  const { loading, user, authId, signOut, activeTabId, tabs, setActiveTabId } = useApp();
  const { clientId, clientError } = useClient();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, router, user]);

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeTabId) ?? tabs[0], [activeTabId, tabs]);

  if (loading) {
    return <DashboardScreenLoader />;
  }

  if (!user) {
    return <DashboardScreenLoader />;
  }

  if (clientError || !clientId) {
    return <ClientFallback clientError={clientError} authId={authId} onLogout={signOut} />;
  }

  return (
    <div className="min-h-screen bg-dashboard-gradient text-slate-900">
      <div className="flex min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-200/80 bg-white/92 px-5 py-6 backdrop-blur xl:flex xl:flex-col">
          <SidebarContent
            tabs={tabs}
            activeTabId={activeTabId}
            setActiveTabId={setActiveTabId}
            onLogout={signOut}
          />
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-30 bg-slate-950/45 xl:hidden" onClick={() => setMobileOpen(false)}>
            <aside
              className="absolute inset-y-0 left-0 w-80 max-w-[85vw] border-r border-slate-200 bg-white p-5 shadow-soft"
              onClick={(event) => event.stopPropagation()}
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

        <main className="flex min-h-screen flex-1 flex-col xl:pl-72">
          <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 xl:hidden">
                <button
                  type="button"
                  onClick={() => setMobileOpen(true)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 shadow-sm"
                  aria-label="Open navigation"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div>
                  <div className="text-sm font-semibold">Evolvnex CRM</div>
                  <div className="text-xs text-slate-500">Client-scoped workspace</div>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                <div className="rounded-full border border-slate-200 bg-white px-3 py-2">
                  Auth ID: {authId ?? "missing"}
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-2">
                  Client ID: {clientId}
                </div>
              </div>
            </div>
          </header>

          <section className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-6xl flex-col gap-6">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.22em] text-sky-700">Dashboard</p>
                  <h1 className="mt-2 text-3xl font-semibold text-slate-950 sm:text-4xl">
                    {activeTab?.label ?? "Summary"}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600">
                    The sidebar is data-driven, client-scoped, and ready to accept database-backed tab
                    definitions later.
                  </p>
                </div>
                <div className="flex justify-start lg:justify-end">
                  <Button variant="secondary" onClick={signOut}>
                    <span className="inline-flex items-center gap-2">
                      <LogOut className="h-4 w-4" />
                      Logout
                    </span>
                  </Button>
                </div>
              </div>

              {activeTab?.id === "summary" && <SummaryTab clientId={clientId} />}
              {activeTab?.id === "appointments" && <AppointmentsTab clientId={clientId} />}
              {!activeTab && <EmptyState />}
            </div>
          </section>
        </main>
      </div>
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
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold text-slate-950">Evolvnex CRM</div>
          <div className="text-sm text-slate-500">Client dashboard</div>
        </div>
      </div>

      <nav className="space-y-2">
        {tabs.map((tab) => {
          const Icon = getTabIcon(tab);
          const isActive = activeTabId === tab.id;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTabId(tab.id);
                onNavigate?.();
              }}
              className={
                isActive
                  ? "flex w-full items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-left text-white shadow-soft"
                  : "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 text-sm font-medium">{tab.label}</span>
              {isActive && <span className="text-xs text-slate-300">Active</span>}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={() => void onLogout()}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
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
    <main className="grid min-h-screen place-items-center bg-dashboard-gradient px-6">
      <div className="rounded-3xl border border-white/70 bg-white px-6 py-5 text-sm text-slate-600 shadow-soft">
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
    <main className="grid min-h-screen place-items-center bg-dashboard-gradient px-6">
      <div className="w-full max-w-xl rounded-[2rem] border border-rose-200 bg-white p-8 shadow-soft">
        <div className="flex items-center gap-3 text-rose-700">
          <AlertCircle className="h-5 w-5" />
          <h1 className="text-xl font-semibold">Client not mapped</h1>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          {clientError ?? "No client record is linked to this authenticated user."}
        </p>
        <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-xs text-slate-500">
          Auth ID: {authId ?? "missing"}
        </div>
        <div className="mt-6">
          <Button variant="secondary" onClick={() => void onLogout()}>
            Logout
          </Button>
        </div>
      </div>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
      No tab content is available for the current configuration.
    </div>
  );
}