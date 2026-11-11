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

/** Removes persisted form/record state that can hold patient data (called on sign-out so the next tenant never sees it). */
export function clearPersistentStateByPrefix(prefixes: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
        keys.push(key);
      }
    }
    keys.forEach((key) => storage.removeItem(key));
  } catch {
    // Silently ignore storage issues.
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