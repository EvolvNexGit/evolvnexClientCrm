"use client";

import Image from "next/image";
import { Menu } from "lucide-react";
import { MODULES, type ModuleId } from "@/lib/module-navigation";
import { UserMenu } from "@/components/dashboard/user-menu";

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
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-3 sm:h-16 sm:px-5 lg:px-6">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-text xl:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <Image
            src="/logo.png"
            alt="EvolvNex"
            width={120}
            height={32}
            className="h-7 w-auto object-contain sm:h-8"
            priority
          />
          <div className="hidden min-w-0 flex-col leading-tight md:flex">
            <span className="truncate text-sm font-semibold text-text">EvolvNex</span>
            <span className="truncate text-[11px] text-muted-foreground">
              <span className="text-primary">Business</span> Growth OS
            </span>
          </div>
        </div>

        <nav
          className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto px-1 sm:justify-center sm:gap-2"
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
                    ? "shrink-0 rounded-lg border border-primary px-2.5 py-1.5 text-sm font-medium text-primary sm:px-3"
                    : "shrink-0 rounded-lg border border-transparent px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-text sm:px-3"
                }
              >
                {module.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto shrink-0">
          <UserMenu userLabel={userLabel} onOpenProfile={onOpenProfile} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
