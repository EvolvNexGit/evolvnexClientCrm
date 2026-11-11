"use client";

import { useCallback, useState } from "react";
import { usePrintJob } from "@/hooks/use-print-job";
import { usePrintSettings } from "@/hooks/use-print-settings";
import type { ClinicBillRecord } from "@/lib/clinic-billing-types";
import { fetchClinicBillById } from "@/lib/clinic-billing-queries";

/**
 * Receipt printing for a clinic bill: print settings (margins, readiness), the one-frame-then-print
 * job and the by-id fetch, so the paper is always built from the stored bill (D-08).
 */
export function useClinicReceiptPrint(clientId: string) {
  const printSettings = usePrintSettings(clientId);
  const { printPayload, requestPrint, clearPrintJob } = usePrintJob<ClinicBillRecord>();
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const { ready } = printSettings;

  const printBill = useCallback(
    async (billId: string) => {
      if (!ready || printingId !== null) {
        return;
      }

      setPrintError(null);
      setPrintingId(billId);
      try {
        const bill = await fetchClinicBillById(clientId, billId);
        if (!bill) {
          setPrintError("Bill not found.");
          return;
        }

        requestPrint(bill);
      } catch (printLoadError) {
        setPrintError(printLoadError instanceof Error ? printLoadError.message : "Unable to load the bill for printing.");
      } finally {
        setPrintingId(null);
      }
    },
    [clientId, ready, printingId, requestPrint],
  );

  return {
    printPayload,
    margins: printSettings.margins,
    ready,
    hasSavedSettings: printSettings.hasSavedSettings,
    settingsError: printSettings.error,
    retrySettings: printSettings.refresh,
    printingId,
    printError,
    printBill,
    clearPrintJob,
  };
}
