"use client";

import { useCallback, useEffect, useState } from "react";

type PrintJob<T> = { payload: T; nonce: number };

/** Generic print trigger: mount the sheet with the payload, print after commit, unmount on afterprint. */
export function usePrintJob<T>() {
  const [job, setJob] = useState<PrintJob<T> | null>(null);
  const nonce = job?.nonce ?? null;

  const requestPrint = useCallback((payload: T) => {
    setJob((previous) => ({ payload, nonce: (previous?.nonce ?? 0) + 1 }));
  }, []);

  useEffect(() => {
    if (nonce === null) {
      return;
    }

    const handleAfterPrint = () => setJob(null);
    window.addEventListener("afterprint", handleAfterPrint, { once: true });
    // Wait one frame so the portal sheet is in the DOM before the print dialog opens.
    const frame = window.requestAnimationFrame(() => window.print());

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("afterprint", handleAfterPrint);
    };
  }, [nonce]);

  return { printPayload: job?.payload ?? null, requestPrint };
}
