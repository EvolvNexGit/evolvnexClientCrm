"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { clampPrintMargins, type PrintMargins } from "@/lib/print-settings-types";

type PrintSheetProps = {
  margins: PrintMargins;
  children: ReactNode;
};

/**
 * Shared print sheet (prescriptions now, receipts later). Portals to document.body so the
 * global @media print rule can hide the dashboard. Letterhead margins are applied as spacer
 * rows and cell padding, never as browser page margins, so the browser's own header and
 * footer text cannot land on the letterhead. Only clamped numbers reach style values.
 */
export function PrintSheet({ margins, children }: PrintSheetProps) {
  if (typeof document === "undefined") {
    return null;
  }

  const m = clampPrintMargins(margins);

  return createPortal(
    <div data-print-root className="hidden bg-white text-black print:block">
      <style>{"@page { margin: 0; }"}</style>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <td style={{ height: `${m.header_mm}mm`, padding: 0 }} />
          </tr>
        </thead>
        <tfoot>
          <tr>
            <td style={{ height: `${m.footer_mm}mm`, padding: 0 }} />
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td style={{ padding: `0 ${m.right_mm}mm 0 ${m.left_mm}mm`, verticalAlign: "top" }}>{children}</td>
          </tr>
        </tbody>
      </table>
    </div>,
    document.body,
  );
}
