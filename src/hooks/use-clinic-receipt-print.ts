"use client";

import { useCallback, useState } from "react";
import { usePrintJob } from "@/hooks/use-print-job";
import { usePrintSettings } from "@/hooks/use-print-settings";
import { fetchAppointmentStaffName } from "@/lib/appointment-queries";
import type { ClinicBillRecord } from "@/lib/clinic-billing-types";
import { fetchClinicBillById } from "@/lib/clinic-billing-queries";
import { fetchDoctorPrintProfiles } from "@/lib/doctor-print-profile-queries";
import { resolvePrintProfile, type StandardPrintHeader } from "@/lib/doctor-print-profile-types";
import type { PrintMargins } from "@/lib/print-settings-types";

type ReceiptPrintJob = {
  bill: ClinicBillRecord;
  margins: PrintMargins;
  header: StandardPrintHeader | null;
};

/**
 * Receipt printing for a clinic bill: print settings (margins, readiness), the one-frame-then-print
 * job and the by-id fetch, so the paper is always built from the stored bill (D-08). Margins and the
 * optional standard header are resolved per print from the visit's doctor profile, then the client
 * default profile, then the letterhead margins.
 */
export function useClinicReceiptPrint(clientId: string) {
  const printSettings = usePrintSettings(clientId);
  const { printPayload, requestPrint, clearPrintJob } = usePrintJob<ReceiptPrintJob>();
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const { ready, margins: letterheadMargins } = printSettings;

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

        const [profiles, doctorName] = await Promise.all([
          fetchDoctorPrintProfiles(clientId),
          bill.appointment_id ? fetchAppointmentStaffName(clientId, bill.appointment_id) : Promise.resolve(null),
        ]);
        const resolved = resolvePrintProfile({ doctorName, profiles, letterheadMargins });

        requestPrint({ bill, margins: resolved.margins, header: resolved.header });
      } catch (printLoadError) {
        setPrintError(printLoadError instanceof Error ? printLoadError.message : "Unable to load the bill for printing.");
      } finally {
        setPrintingId(null);
      }
    },
    [clientId, ready, printingId, requestPrint, letterheadMargins],
  );

  return {
    printPayload: printPayload?.bill ?? null,
    printMargins: printPayload?.margins ?? letterheadMargins,
    printHeader: printPayload?.header ?? null,
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
