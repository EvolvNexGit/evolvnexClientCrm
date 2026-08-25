"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PANEL_TRANSITION_MS = 300;

export function useSlideEditorPanel(open: boolean) {
  const [panelVisible, setPanelVisible] = useState(false);

  useEffect(() => {
    if (!open) {
      setPanelVisible(false);
      return;
    }

    setPanelVisible(false);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setPanelVisible(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function closeWithAnimation(onClosed: () => void) {
    setPanelVisible(false);
    window.setTimeout(onClosed, PANEL_TRANSITION_MS);
  }

  return { panelVisible, closeWithAnimation };
}

type SlideEditorPanelProps = {
  open: boolean;
  panelVisible: boolean;
  title: string;
  titleId: string;
  saving: boolean;
  canDelete: boolean;
  formError: string | null;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  children: ReactNode;
};

export function SlideEditorPanel({
  open,
  panelVisible,
  title,
  titleId,
  saving,
  canDelete,
  formError,
  onClose,
  onSave,
  onDelete,
  children,
}: SlideEditorPanelProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40" role="presentation" onClick={onClose}>
      <div
        className={cn(
          "absolute inset-0 bg-black/60 transition-opacity duration-300",
          panelVisible ? "opacity-100" : "opacity-0",
        )}
      />
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-soft transition-transform duration-300 ease-out",
          panelVisible ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted hover:text-text"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h3 id={titleId} className="enx-section-title truncate">
              {title}
            </h3>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {canDelete && onDelete ? (
              <Button type="button" variant="ghost" onClick={() => void onDelete()} disabled={saving}>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            ) : null}
            <Button type="button" onClick={() => void onSave()} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          {formError ? (
            <div className="mb-4 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
              {formError}
            </div>
          ) : null}
          {children}
        </div>
      </aside>
    </div>
  );
}
