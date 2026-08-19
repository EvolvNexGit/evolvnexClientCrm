import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Evolvnex Client CRM",
  description: "A modern CRM shell with Supabase Auth and client-scoped data flows.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`dark ${inter.className}`}>
      <body className="bg-background text-text antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}