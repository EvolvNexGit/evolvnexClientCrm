"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EntityModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  contentClassName?: string;
};

export function EntityModal({ open, title, onClose, children, contentClassName }: EntityModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 pb-safe sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={cn(
          "flex max-h-[min(92dvh,100%)] w-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-soft",
          contentClassName ?? "sm:max-w-lg",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="entity-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5 sm:py-4">
          <h3 id="entity-modal-title" className="pr-2 text-lg font-semibold leading-snug text-text">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-text"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 sm:py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
