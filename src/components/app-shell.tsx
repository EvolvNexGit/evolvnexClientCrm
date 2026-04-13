"use client";

import type { ReactNode } from "react";
import { AppProvider } from "@/contexts/app-context";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <div className="min-h-screen bg-background text-text flex">

        {/* 🧠 Main Content */}
        <main className="flex-1 bg-background">
          <div className="p-6">{children}</div>
        </main>

      </div>
    </AppProvider>
  );
}