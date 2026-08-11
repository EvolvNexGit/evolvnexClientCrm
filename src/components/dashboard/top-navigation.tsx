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
    <header className="sticky top-0 z-20 border-b border-border bg-background/95 pt-safe backdrop-blur">
      {/* Mobile / tablet (< xl): menu + logo + avatar. No module chip scroller. */}
      <div className="flex h-14 min-w-0 items-center gap-2 px-3 xl:hidden">
        <button
          type="button"
          onClick={onOpenMobileSidebar}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-text"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex min-w-0 flex-1 items-center">
          <Image
            src="/logo.png"
            alt="EvolvNex"
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

      {/* Desktop (xl+): existing logo slot + module tabs + user menu */}
      <div className="hidden h-16 min-w-0 items-center xl:flex">
        <div className="flex h-full w-64 shrink-0 items-center px-5">
          <Image
            src="/logo.png"
            alt="EvolvNex"
            width={140}
            height={28}
            className="h-6 w-auto max-w-[140px] object-contain object-left"
            priority
          />
        </div>

        <nav
          className="flex min-w-0 flex-1 items-center justify-start gap-2 px-3"
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
                    ? "shrink-0 rounded-lg border border-primary px-3 py-1.5 text-sm font-medium text-primary"
                    : "shrink-0 rounded-lg border border-transparent px-3 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-text"
                }
              >
                {module.label}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto shrink-0 px-6">
          <UserMenu userLabel={userLabel} onOpenProfile={onOpenProfile} onLogout={onLogout} />
        </div>
      </div>
    </header>
  );
}
