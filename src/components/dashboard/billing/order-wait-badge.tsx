"use client";

import { useEffect, useState } from "react";
import { getElapsedMinutes } from "@/lib/time-utils";

export function OrderWaitBadge({ createdAt }: { createdAt: string }) {
  const [minutes, setMinutes] = useState(() => getElapsedMinutes(createdAt));

  useEffect(() => {
    const tick = () => setMinutes(getElapsedMinutes(createdAt));
    tick();
    const intervalId = setInterval(tick, 1000);
    return () => clearInterval(intervalId);
  }, [createdAt]);

  return (
    <div
      className="absolute -right-2 -top-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-redGlow ring-2 ring-background"
      title={`Waiting ${minutes} minute${minutes === 1 ? "" : "s"}`}
    >
      {minutes}
    </div>
  );
}
