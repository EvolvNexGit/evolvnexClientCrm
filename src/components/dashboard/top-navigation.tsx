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
      <div className="flex h-14 items-center sm:h-16">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="ml-3 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-text xl:hidden"
          aria-label="Open sidebar"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Logo slot aligned to sidebar width on desktop so it never overlaps the sidebar edge */}
        <div className="flex h-full shrink-0 items-center px-4 xl:w-64 xl:px-5">
          <Image
            src="/logo.png"
            alt="EvolvNex"
            width={140}
            height={28}
            className="h-5 w-auto max-w-[140px] object-contain object-left sm:h-6"
            priority
          />
        </div>

        <nav
          className="flex min-w-0 flex-1 items-center justify-start gap-1 overflow-x-auto px-2 sm:gap-2 sm:px-3"
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

        <div className="ml-auto shrink-0 px-3 sm:px-5 lg:px-6">
          <UserMenu userLabel={userLabel} onOpenProfile={onOpenProfile} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
