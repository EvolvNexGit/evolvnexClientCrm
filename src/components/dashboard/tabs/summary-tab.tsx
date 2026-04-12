"use client";

import type { AppTabContent } from "@/lib/types";

export default function SummaryTab({ clientId }: { clientId: string }) {
  const cards: AppTabContent[] = [
    {
      title: "Client scope",
      body: `All operational data should be filtered by client_id ${clientId}.`,
    },
    {
      title: "Extensibility",
      body: "Swap the tab source from static config to Supabase rows without changing the UI layer.",
    },
    {
      title: "Safety",
      body: "Auth and client mapping failures render fallbacks instead of crashing the shell.",
    },
  ];

  return (
    <section className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <article key={card.title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">{card.title}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{card.body}</p>
        </article>
      ))}
    </section>
  );
}