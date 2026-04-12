"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/app-context";
import { Loader2 } from "lucide-react";

export default function HomePage() {
  const router = useRouter();
  const { loading, user } = useAuth();

  useEffect(() => {
    if (!loading) {
      router.replace(user ? "/dashboard" : "/login");
    }
  }, [loading, router, user]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-dashboard-gradient px-6">
      <div className="rounded-3xl border border-white/70 bg-white/80 px-6 py-5 text-sm text-slate-600 shadow-soft backdrop-blur">
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing your workspace
        </span>
      </div>
    </main>
  );
}