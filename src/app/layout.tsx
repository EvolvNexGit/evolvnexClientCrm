import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Evolvnex Client CRM",
  description: "A modern CRM shell with Supabase Auth and client-scoped data flows.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-text antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}