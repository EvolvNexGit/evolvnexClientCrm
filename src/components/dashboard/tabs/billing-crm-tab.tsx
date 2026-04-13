"use client";

import { useMemo, useState } from "react";

type BillingSubTab = "customer" | "product" | "bill";

const subTabs: Array<{ id: BillingSubTab; label: string; description: string }> = [
  {
    id: "customer",
    label: "Customer",
    description: "Manage customer profiles, contact details, and billing preferences.",
  },
  {
    id: "product",
    label: "Product",
    description: "Manage billable products, pricing, and service catalog entries.",
  },
  {
    id: "bill",
    label: "Bill",
    description: "Prepare invoices, track statuses, and record payment collections.",
  },
];

export default function BillingCrmTab({ clientId }: { clientId: string }) {
  const [activeSubTab, setActiveSubTab] = useState<BillingSubTab>("customer");

  const activeTab = useMemo(
    () => subTabs.find((tab) => tab.id === activeSubTab) ?? subTabs[0],
    [activeSubTab],
  );

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Billling Crm</h2>
          <p className="mt-1 text-sm text-slate-500">Client scope: {clientId}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2">
        {subTabs.map((tab) => {
          const isActive = tab.id === activeSubTab;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={
                isActive
                  ? "rounded-xl bg-slate-950 px-4 py-2 text-sm font-medium text-white"
                  : "rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-950"
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 p-5">
        <h3 className="text-base font-semibold text-slate-950">{activeTab.label}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{activeTab.description}</p>
      </div>
    </section>
  );
}
