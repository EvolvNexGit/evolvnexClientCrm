"use client";

import { Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { MODULES, type ModuleId } from "@/lib/module-navigation";
import { UserMenu } from "@/components/dashboard/user-menu";

function ModuleTabs({
  visibleModules,
  activeModuleId,
  onModuleChange,
  compact,
}: {
  visibleModules: { id: ModuleId; label: string }[];
  activeModuleId: ModuleId;
  onModuleChange: (moduleId: ModuleId) => void;
  compact?: boolean;
}) {
  return (
    <nav
      className={
        compact
          ? "flex min-w-0 flex-wrap items-center gap-1 px-3 pb-2"
          : "flex min-w-0 flex-1 items-center justify-start gap-2 px-3"
      }
      aria-label="Product modules"
    >
      {visibleModules.map((module) => {
        const isActive = module.id === activeModuleId;
        return (
          <button
            key={module.id}
            type="button"
            onClick={() => onModuleChange(module.id)}
            className={
              isActive
                ? "shrink-0 rounded-lg border border-primary px-2.5 py-1.5 text-sm font-medium text-primary md:px-3"
                : "shrink-0 rounded-lg border border-transparent px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-text md:px-3"
            }
          >
            {module.label}
          </button>
        );
      })}
    </nav>
  );
}

export function TopNavigation({
  activeModuleId,
  visibleModuleIds,
  onModuleChange,
  onOpenMobileSidebar,
  onOpenProfile,
  onLogout,
  userLabel,
}: {
  activeModuleId: ModuleId;
  visibleModuleIds: ModuleId[];
  onModuleChange: (moduleId: ModuleId) => void;
  onOpenMobileSidebar: () => void;
  onOpenProfile: () => void;
  onLogout: () => Promise<void>;
  userLabel: string;
}) {
  const visibleModules = MODULES.filter((module) => visibleModuleIds.includes(module.id));

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 pt-safe backdrop-blur">
      {/* Phone (< md): menu + logo + avatar. No module chips. */}
      <div className="flex h-14 min-w-0 items-center gap-2 px-3 md:hidden">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-text"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex min-w-0 flex-1 items-center">
          <BrandLogo
            width={140}
            height={28}
            className="h-5 w-auto max-h-5 max-w-[140px] object-contain object-left"
            priority
          />
        </div>

        <UserMenu
          userLabel={userLabel}
          onOpenProfile={onOpenProfile}
          onLogout={onLogout}
          compact
        />
      </div>

      {/* Tablet (md–xl): compact top modules + drawer for contextual items. No persistent sidebar. */}
      <div className="hidden min-w-0 flex-col md:flex xl:hidden">
        <div className="flex h-14 min-w-0 items-center gap-2 px-3">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-text"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 shrink-0 items-center">
            <BrandLogo
              width={140}
              height={28}
              className="h-5 w-auto max-h-5 max-w-[132px] object-contain object-left"
              priority
            />
          </div>

          <div className="ml-auto shrink-0">
            <UserMenu userLabel={userLabel} onOpenProfile={onOpenProfile} onLogout={onLogout} compact />
          </div>
        </div>

        <ModuleTabs
          visibleModules={visibleModules}
          activeModuleId={activeModuleId}
          onModuleChange={onModuleChange}
          compact
        />
      </div>

      {/* Desktop (xl+): existing logo slot + module tabs + user menu */}
      <div className="hidden h-16 min-w-0 items-center xl:flex">
        <div className="flex h-full w-64 shrink-0 items-center px-5">
          <BrandLogo
            width={140}
            height={28}
            className="h-6 w-auto max-w-[140px] object-contain object-left"
            priority
          />
        </div>

        <ModuleTabs
          visibleModules={visibleModules}
          activeModuleId={activeModuleId}
          onModuleChange={onModuleChange}
        />

        <div className="ml-auto shrink-0 px-6">
          <UserMenu userLabel={userLabel} onOpenProfile={onOpenProfile} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
