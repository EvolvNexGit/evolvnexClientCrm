"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, User } from "lucide-react";

export function UserMenu({
  userLabel,
  onOpenProfile,
  onLogout,
}: {
  userLabel: string;
  onOpenProfile: () => void;
  onLogout: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const initials = userLabel
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "U";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-2 py-1.5 text-left hover:bg-muted sm:px-3"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
          {initials}
        </span>
        <span className="hidden max-w-[120px] truncate text-sm font-medium text-text sm:inline">
          {userLabel}
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-soft"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-text hover:bg-muted"
            onClick={() => {
              setOpen(false);
              onOpenProfile();
            }}
          >
            <User className="h-4 w-4 text-muted-foreground" />
            My Profile
          </button>
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-text hover:bg-muted"
            onClick={() => {
              setOpen(false);
              void onLogout();
            }}
          >
            <LogOut className="h-4 w-4 text-muted-foreground" />
            Logout
          </button>
        </div>
      ) : null}
    </div>
  );
}
