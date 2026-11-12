"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Subscribes to a CSS media query; server snapshot is false so SSR and first client render match. */
export function useMediaQuery(query: string): boolean {
  // Stable per query so useSyncExternalStore does not resubscribe on every render.
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener("change", onChange);
      return () => mediaQueryList.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
