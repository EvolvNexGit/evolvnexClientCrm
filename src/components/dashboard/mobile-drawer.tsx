"use client";

import { LogOut, User, X } from "lucide-react";
import { MODULES, type ModuleId, type ResolvedSidebarItem } from "@/lib/module-navigation";
import { getModuleById } from "@/lib/module-navigation";

export function MobileDrawer({
  open,
  activeModuleId,
  visibleModuleIds,
  items,
  activeNavKey,
  onClose,
  onModuleChange,
  onItemSelect,
  onOpenProfile,
  onLogout,
}: {
  open: boolean;
  activeModuleId: ModuleId;
  visibleModuleIds: ModuleId[];
  items: ResolvedSidebarItem[];
  activeNavKey: string | null;
  onClose: () => void;
  onModuleChange: (moduleId: ModuleId) => void;
  onItemSelect: (item: ResolvedSidebarItem) => void;
  onOpenProfile: () => void;
  onLogout: () => Promise<void>;
}) {
  if (!open) {
    return null;
  }

  const visibleModules = MODULES.filter((module) => visibleModuleIds.includes(module.id));
  const activeModule = getModuleById(activeModuleId);

  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 xl:hidden"
      onClick={onClose}
      role="presentation"
    >
      <aside
        className="absolute inset-y-0 left-0 flex w-80 max-w-[min(85vw,20rem)] flex-col overflow-hidden border-r border-border bg-card shadow-soft pt-safe pb-safe pl-safe"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-text">Menu</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:bg-muted hover:text-text"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Modules
          </p>
          <nav className="space-y-1.5" aria-label="Product modules">
            {visibleModules.map((module) => {
              const isActive = module.id === activeModuleId;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => onModuleChange(module.id)}
                  className={
                    isActive
                      ? "flex min-h-11 w-full items-center rounded-xl border border-primary bg-primary/10 px-3 py-2.5 text-sm font-medium text-primary"
                      : "flex min-h-11 w-full items-center rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-text"
                  }
                >
                  {module.label}
                </button>
              );
            })}
          </nav>

          <div className="my-4 border-t border-border" />

          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {activeModule?.label ?? "Module"}
          </p>
          <nav className="space-y-1.5" aria-label={`${activeModule?.label ?? "Module"} navigation`}>
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = activeNavKey === item.navKey;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onItemSelect(item)}
                  className={
                    isActive
                      ? "flex min-h-11 w-full items-center gap-3 rounded-xl bg-gradient-to-r from-primary/25 to-transparent px-3 py-2.5 text-primary"
                      : "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-muted-foreground hover:bg-muted hover:text-text"
                  }
                >
                  <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-primary" : ""}`} />
                  <span className="flex-1 text-left text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
            {items.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">No items available.</p>
            ) : null}
          </nav>

          <div className="my-4 border-t border-border" />

          <nav className="space-y-1.5" aria-label="Account">
            <button
              type="button"
              onClick={onOpenProfile}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-text"
            >
              <User className="h-4 w-4 shrink-0" />
              My Profile
            </button>
            <button
              type="button"
              onClick={() => void onLogout()}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-text"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Logout
            </button>
          </nav>
        </div>
      </aside>
    </div>
  );
}
