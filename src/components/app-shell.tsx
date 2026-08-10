"use client";

import type { ReactNode } from "react";
import { AppProvider } from "@/contexts/app-context";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <div className="min-h-screen bg-background text-text">{children}</div>
    </AppProvider>
  );
}