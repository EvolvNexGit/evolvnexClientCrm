"use client";

import { useEffect, useState } from "react";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { PrintSheet } from "@/components/dashboard/print/print-sheet";
import { TestPrintBody } from "@/components/dashboard/print/test-print-body";
import { Button } from "@/components/ui/button";
import { usePrintJob } from "@/hooks/use-print-job";
import {
  marginsToForm,
  parseMarginsForm,
  PRINT_MARGIN_KEYS,
  PRINT_MARGIN_LIMITS_MM,
  type PrintMarginKey,
  type PrintMargins,
  type PrintSettingsPayload,
} from "@/lib/print-settings-types";

type PrintSettingsModalProps = {
  open: boolean;
  onClose: () => void;
  margins: PrintMargins;
  hasSavedSettings: boolean;
  saving: boolean;
  saveError: string | null;
  onSave: (payload: PrintSettingsPayload) => Promise<void>;
};

export function PrintSettingsModal({
  open,
  onClose,
  margins,
  hasSavedSettings,
  saving,
  saveError,
  onSave,
}: PrintSettingsModalProps) {
  const [form, setForm] = useState<Record<PrintMarginKey, string>>(() => marginsToForm(margins));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PrintMarginKey, string>>>({});
  const { printPayload, requestPrint } = usePrintJob<PrintMargins>();
  const draft = parseMarginsForm(form);

  // Initialise only when the modal opens so a background refresh never overwrites typing.
  useEffect(() => {
    if (open) {
      setForm(marginsToForm(margins));
      setFieldErrors({});
    }
  }, [open]);

  const handleSave = async () => {
    const parsed = parseMarginsForm(form);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      return;
    }

    setFieldErrors({});
    try {
      await onSave({
        headerMm: parsed.margins.header_mm,
        footerMm: parsed.margins.footer_mm,
        leftMm: parsed.margins.left_mm,
        rightMm: parsed.margins.right_mm,
      });
      onClose();
    } catch {
      // The hook exposes the failure through saveError.
    }
  };

  const handleTestPrint = () => {
    if (draft.ok) {
      requestPrint(draft.margins);
    }
  };

  return (
    <>
      <EntityModal open={open} title="Print settings" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Distance in millimetres kept clear for your pre-printed letterhead. Adjust after a test print on your
            letterhead.
          </p>
          {!hasSavedSettings && (
            <p className="text-sm text-muted-foreground">Nothing saved yet: prints use 0 mm until you save.</p>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PRINT_MARGIN_KEYS.map((key) => {
              const limits = PRINT_MARGIN_LIMITS_MM[key];
              const inputId = `print-margin-${key}`;
              return (
                <div key={key}>
                  <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-text">
                    {limits.label} (mm, {limits.min}-{limits.max})
                  </label>
                  <input
                    id={inputId}
                    type="number"
                    step={0.5}
                    inputMode="decimal"
                    min={limits.min}
                    max={limits.max}
                    value={form[key]}
                    onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                    className="min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none"
                  />
                  {fieldErrors[key] && (
                    <p className="mt-1 text-xs text-primary" role="alert">
                      {fieldErrors[key]}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {saveError && (
            <p className="text-sm text-primary" role="alert">
              {saveError}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={handleTestPrint} disabled={saving || !draft.ok}>
              Test print
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </EntityModal>
      {/* Outside the modal so the sheet stays mounted if the modal closes during the print dialog. */}
      {printPayload && (
        <PrintSheet margins={printPayload}>
          <TestPrintBody margins={printPayload} />
        </PrintSheet>
      )}
    </>
  );
}
