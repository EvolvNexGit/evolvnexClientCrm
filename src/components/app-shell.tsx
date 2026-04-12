"use client";

import type { ReactNode } from "react";
import { AppProvider } from "@/contexts/app-context";

export function AppShell({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>;
}