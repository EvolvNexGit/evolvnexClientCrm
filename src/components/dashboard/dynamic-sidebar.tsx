"use client";

import { PanelLeftClose, PanelRightClose } from "lucide-react";
import type { ModuleId, ResolvedSidebarItem } from "@/lib/module-navigation";
import { getModuleById } from "@/lib/module-navigation";

export function DynamicSidebar({
  moduleId,
  items,
  activeNavKey,
  collapsed,
  onToggleCollapse,
  onNavigate,
  onItemSelect,
}: {
  moduleId: ModuleId;
  items: ResolvedSidebarItem[];
  activeNavKey: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate?: () => void;
  onItemSelect: (item: ResolvedSidebarItem) => void;
}) {
  const module = getModuleById(moduleId);

  return (
    <>
      <div className={`mb-6 flex ${collapsed ? "justify-center" : "items-center justify-between gap-3"}`}>
        {!collapsed ? (
          <div className="min-w-0">
            <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Module
            </p>
            <h2 className="truncate text-lg font-semibold text-text">{module?.label ?? "EvolvNex"}</h2>
          </div>
        ) : null}
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

      <nav className="space-y-1.5" aria-label={`${module?.label ?? "Module"} navigation`}>
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = activeNavKey === item.navKey;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onItemSelect(item);
                onNavigate?.();
              }}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
              className={
                isActive
                  ? `flex w-full items-center rounded-xl bg-gradient-to-r from-primary/25 to-transparent py-2.5 text-primary ${
                      collapsed ? "justify-center px-3" : "gap-3 px-3"
                    }`
                  : `flex w-full items-center rounded-xl py-2.5 text-muted-foreground hover:bg-muted hover:text-text ${
                      collapsed ? "justify-center px-3" : "gap-3 px-3"
                    }`
              }
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
              {!collapsed && <span className="flex-1 text-left text-sm font-medium">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <p className={`mt-4 text-sm text-muted-foreground ${collapsed ? "text-center" : ""}`}>
          {collapsed ? "—" : "No items available."}
        </p>
      ) : null}
    </>
  );
}
