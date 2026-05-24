"use client";

import type { ReactNode } from "react";

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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4" onClick={onClose}>
      <div
        className={`w-full rounded-2xl border border-border bg-card p-5 shadow-soft ${contentClassName ?? "max-w-lg"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-xl font-semibold text-text">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1 text-sm text-muted-foreground hover:text-text"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
