"use client";

import type { ReactNode } from "react";
import { AppProvider } from "@/contexts/app-context";
import { ThemeProvider } from "@/contexts/theme-context";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AppProvider>
        <div className="min-h-dvh min-w-0 bg-background text-text">{children}</div>
      </AppProvider>
    </ThemeProvider>
  );
}