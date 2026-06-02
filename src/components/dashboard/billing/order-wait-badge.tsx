"use client";

import { useEffect, useState } from "react";
import { formatElapsedMmSs } from "@/lib/time-utils";

export function OrderWaitBadge({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(() => formatElapsedMmSs(createdAt));

  useEffect(() => {
    const tick = () => setElapsed(formatElapsedMmSs(createdAt));
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [createdAt]);

  return (
    <span
      className="min-w-[4.75rem] shrink-0 text-right text-sm font-bold tabular-nums leading-none text-primary"
      title={`Waiting ${elapsed}`}
      aria-label={`Waiting ${elapsed}`}
    >
      {elapsed}
    </span>
  );
}
