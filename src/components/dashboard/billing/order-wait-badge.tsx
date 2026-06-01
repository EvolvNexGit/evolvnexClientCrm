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
    <div
      className="relative flex size-14 shrink-0 items-center justify-center rounded-full bg-primary shadow-redGlow"
      title={`Waiting ${elapsed}`}
      aria-label={`Waiting ${elapsed}`}
    >
      <span className="text-[11px] font-bold tabular-nums leading-none text-primary-foreground">{elapsed}</span>
    </div>
  );
}
