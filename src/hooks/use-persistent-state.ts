"use client";

import { useEffect, useState } from "react";

function readStoredValue<T>(key: string, initialValue: T): T {
  if (typeof window === "undefined") {
    return initialValue;
  }

  try {
    const stored = window.localStorage.getItem(key);
    if (!stored) {
      return initialValue;
    }

    return JSON.parse(stored) as T;
  } catch {
    return initialValue;
  }
}

export function usePersistentState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => readStoredValue(key, initialValue));

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Silently ignore storage issues.
    }
  }, [key, value]);

  return [value, setValue] as const;
}