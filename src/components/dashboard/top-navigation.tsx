"use client";

import { useEffect, useRef } from "react";
import { ChevronDown, Menu } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { ResponsiveScrollStrip } from "@/components/ui/responsive";
import { MODULES, type ModuleId, type ResolvedSidebarItem } from "@/lib/module-navigation";
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
                ? "shrink-0 rounded-lg border border-primary px-2.5 py-1.5 text-sm font-medium text-primary md:px-3 max-xl:min-h-11"
                : "shrink-0 rounded-lg border border-transparent px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition hover:text-text md:px-3 max-xl:min-h-11"
            }
          >
            {module.label}
          </button>
        );
      })}
    </nav>
  );
}

function SectionTabs({
  items,
  activeNavKey,
  moduleLabel,
  onSelect,
  onOpenMenu,
}: {
  items: ResolvedSidebarItem[];
  activeNavKey: string | null;
  moduleLabel: string;
  onSelect: (item: ResolvedSidebarItem) => void;
  onOpenMenu: () => void;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const activeChipRef = useRef<HTMLButtonElement | null>(null);

  // Center the active chip by scrolling the strip only (no ancestor shifts).
  useEffect(() => {
    const strip = stripRef.current;
    const chip = activeChipRef.current;
    if (!strip || !chip) {
      return;
    }
    strip.scrollTo({
      left: chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2,
      behavior: "smooth",
    });
  }, [activeNavKey, items]);

  if (items.length < 2) {
    return null;
  }

  return (
    <nav className="min-w-0 px-3 pb-2 xl:hidden" aria-label="Section navigation">
      <ResponsiveScrollStrip className="relative" containerRef={stripRef}>
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={`${moduleLabel} module, open menu`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm font-medium text-text md:hidden"
        >
          {moduleLabel}
          <ChevronDown className="h-4 w-4" />
        </button>
        {items.map((item) => {
          const isActive = item.navKey === activeNavKey;
          return (
            <button
              key={item.id}
              ref={isActive ? activeChipRef : undefined}
              type="button"
              onClick={() => onSelect(item)}
              aria-current={isActive ? "page" : undefined}
              className={
                isActive
                  ? "min-h-11 shrink-0 rounded-full border border-primary bg-primary/10 px-4 text-sm font-medium text-primary transition"
                  : "min-h-11 shrink-0 rounded-full border border-border bg-card px-4 text-sm font-medium text-muted-foreground transition hover:text-text"
              }
            >
              {item.label}
            </button>
          );
        })}
      </ResponsiveScrollStrip>
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
  sectionItems,
  activeNavKey,
  onSectionSelect,
}: {
  activeModuleId: ModuleId;
  visibleModuleIds: ModuleId[];
  onModuleChange: (moduleId: ModuleId) => void;
  onOpenMobileSidebar: () => void;
  onOpenProfile: () => void;
  onLogout: () => Promise<void>;
  userLabel: string;
  sectionItems: ResolvedSidebarItem[];
  activeNavKey: string | null;
  onSectionSelect: (item: ResolvedSidebarItem) => void;
}) {
  const visibleModules = MODULES.filter((module) => visibleModuleIds.includes(module.id));

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background pt-safe">
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

      <SectionTabs
        items={sectionItems}
        activeNavKey={activeNavKey}
        moduleLabel={MODULES.find((module) => module.id === activeModuleId)?.label ?? "Menu"}
        onSelect={onSectionSelect}
        onOpenMenu={onOpenMobileSidebar}
      />

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
