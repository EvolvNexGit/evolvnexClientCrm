"use client";

import type { ReactNode } from "react";
import { AppProvider } from "@/contexts/app-context";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <div className="min-h-screen bg-background text-text flex">
        
        {/* 🔥 Sidebar (placeholder for now) */}
        <aside className="w-64 bg-card border-r border-border hidden md:flex flex-col">
          <div className="p-4 border-b border-border font-semibold">
            EvolvNex CRM
          </div>

          <nav className="flex-1 p-3 space-y-1">
            <div className="px-3 py-2 rounded-lg hover:bg-muted cursor-pointer">
              Dashboard
            </div>
            <div className="px-3 py-2 rounded-lg hover:bg-muted cursor-pointer">
              Clients
            </div>
            <div className="px-3 py-2 rounded-lg hover:bg-muted cursor-pointer">
              Settings
            </div>
          </nav>
        </aside>

        {/* 🧠 Main Content */}
        <main className="flex-1 bg-background">
          <div className="p-6">{children}</div>
        </main>

      </div>
    </AppProvider>
  );
}