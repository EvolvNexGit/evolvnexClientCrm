"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";

type SubscriptionStatus = "active" | "inactive";
type BillingCycle = "monthly" | "quarterly" | "yearly";

type Subscription = {
  id: string;
  name: string;
  planCode: string;
  amount: number;
  billingCycle: BillingCycle;
  maxUsers: number;
  status: SubscriptionStatus;
  notes: string;
  createdAt: string;
};

type SubscriptionFormState = {
  name: string;
  planCode: string;
  amount: string;
  billingCycle: BillingCycle;
  maxUsers: string;
  notes: string;
};

const placeholderSubscriptions: Subscription[] = [
  {
    id: "sub-basic",
    name: "Starter Care",
    planCode: "STARTER-001",
    amount: 39,
    billingCycle: "monthly",
    maxUsers: 5,
    status: "active",
    notes: "Good for small teams.",
    createdAt: "2026-01-15",
  },
  {
    id: "sub-growth",
    name: "Growth Plus",
    planCode: "GROWTH-010",
    amount: 99,
    billingCycle: "monthly",
    maxUsers: 25,
    status: "inactive",
    notes: "Paused pending renewal.",
    createdAt: "2026-02-03",
  },
  {
    id: "sub-pro",
    name: "Pro Enterprise",
    planCode: "PRO-100",
    amount: 999,
    billingCycle: "yearly",
    maxUsers: 250,
    status: "active",
    notes: "Dedicated support included.",
    createdAt: "2026-03-22",
  },
];

const emptyForm: SubscriptionFormState = {
  name: "",
  planCode: "",
  amount: "",
  billingCycle: "monthly",
  maxUsers: "",
  notes: "",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function cycleLabel(cycle: BillingCycle) {
  if (cycle === "monthly") {
    return "Monthly";
  }

  if (cycle === "quarterly") {
    return "Quarterly";
  }

  return "Yearly";
}

function getStatusBadgeClass(status: SubscriptionStatus) {
  return status === "active"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : "border-amber-200 bg-amber-50 text-amber-700";
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `sub-${Date.now()}`;
}

export default function SubscriptionTab({ clientId }: { clientId: string }) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(placeholderSubscriptions);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formState, setFormState] = useState<SubscriptionFormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const activeCount = useMemo(
    () => subscriptions.filter((subscription) => subscription.status === "active").length,
    [subscriptions],
  );

  const inactiveCount = subscriptions.length - activeCount;

  const editingSubscription = useMemo(
    () => subscriptions.find((subscription) => subscription.id === editingId) ?? null,
    [editingId, subscriptions],
  );

  function resetForm() {
    setFormState(emptyForm);
    setFormError(null);
  }

  function validateForm(state: SubscriptionFormState) {
    if (!state.name.trim()) {
      return "Subscription name is required.";
    }

    if (!state.planCode.trim()) {
      return "Plan code is required.";
    }

    const amount = Number(state.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return "Amount must be a valid positive number.";
    }

    const maxUsers = Number(state.maxUsers);
    if (!Number.isInteger(maxUsers) || maxUsers <= 0) {
      return "Max users must be an integer greater than 0.";
    }

    return null;
  }

  function applyFormToSubscription(state: SubscriptionFormState, current?: Subscription): Subscription {
    return {
      id: current?.id ?? createId(),
      name: state.name.trim(),
      planCode: state.planCode.trim(),
      amount: Number(state.amount),
      billingCycle: state.billingCycle,
      maxUsers: Number(state.maxUsers),
      status: current?.status ?? "inactive",
      notes: state.notes.trim(),
      createdAt: current?.createdAt ?? new Date().toISOString().slice(0, 10),
    };
  }

  function handleAddSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const error = validateForm(formState);
    if (error) {
      setFormError(error);
      return;
    }

    const newSubscription = applyFormToSubscription(formState);
    setSubscriptions((current) => [newSubscription, ...current]);
    resetForm();
    setShowAddForm(false);
  }

  function openEdit(subscription: Subscription) {
    setEditingId(subscription.id);
    setFormState({
      name: subscription.name,
      planCode: subscription.planCode,
      amount: String(subscription.amount),
      billingCycle: subscription.billingCycle,
      maxUsers: String(subscription.maxUsers),
      notes: subscription.notes,
    });
    setFormError(null);
  }

  function closeEdit() {
    setEditingId(null);
    resetForm();
  }

  function handleSaveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingSubscription) {
      return;
    }

    const error = validateForm(formState);
    if (error) {
      setFormError(error);
      return;
    }

    const next = applyFormToSubscription(formState, editingSubscription);
    setSubscriptions((current) =>
      current.map((subscription) => (subscription.id === editingSubscription.id ? next : subscription)),
    );

    closeEdit();
  }

  function toggleStatus(subscriptionId: string) {
    setSubscriptions((current) =>
      current.map((subscription) => {
        if (subscription.id !== subscriptionId) {
          return subscription;
        }

        return {
          ...subscription,
          status: subscription.status === "active" ? "inactive" : "active",
        };
      }),
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-text">Subscription Management</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Placeholder-only tab for now. Client scope: {clientId}
            </p>
          </div>
          <Button
            onClick={() => {
              setShowAddForm((current) => !current);
              setEditingId(null);
              resetForm();
            }}
          >
            {showAddForm ? "Close" : "Add Subscription"}
          </Button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <MetricCard label="Total" value={String(subscriptions.length)} />
          <MetricCard label="Active" value={String(activeCount)} />
          <MetricCard label="Inactive" value={String(inactiveCount)} />
        </div>
      </div>

      {showAddForm && (
        <SubscriptionForm
          title="Add New Subscription"
          description="Create a new placeholder subscription record."
          formState={formState}
          formError={formError}
          submitLabel="Create Subscription"
          onSubmit={handleAddSubmit}
          onCancel={() => {
            setShowAddForm(false);
            resetForm();
          }}
          onChange={setFormState}
        />
      )}

      {editingSubscription && (
        <SubscriptionForm
          title="Modify Subscription"
          description={`Editing ${editingSubscription.name}`}
          formState={formState}
          formError={formError}
          submitLabel="Save Changes"
          onSubmit={handleSaveEdit}
          onCancel={closeEdit}
          onChange={setFormState}
        />
      )}

      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
        <h3 className="text-lg font-semibold text-text">All Subscriptions</h3>

        {subscriptions.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No subscriptions added yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Plan</th>
                  <th className="px-3 py-3">Price</th>
                  <th className="px-3 py-3">Cycle</th>
                  <th className="px-3 py-3">Users</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {subscriptions.map((subscription) => {
                  const isActive = subscription.status === "active";

                  return (
                    <tr key={subscription.id} className="align-top">
                      <td className="px-3 py-4 font-medium text-text">{subscription.name}</td>
                      <td className="px-3 py-4 text-muted-foreground">{subscription.planCode}</td>
                      <td className="px-3 py-4 text-text">{formatCurrency(subscription.amount)}</td>
                      <td className="px-3 py-4 text-muted-foreground">{cycleLabel(subscription.billingCycle)}</td>
                      <td className="px-3 py-4 text-muted-foreground">{subscription.maxUsers}</td>
                      <td className="px-3 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(
                            subscription.status,
                          )}`}
                        >
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-3 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => toggleStatus(subscription.id)}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-muted"
                          >
                            {isActive ? "Deactivate" : "Activate"}
                          </button>
                          <button
                            type="button"
                            onClick={() => openEdit(subscription)}
                            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text hover:bg-muted"
                          >
                            Modify
                          </button>
                        </div>
                        {subscription.notes && (
                          <p className="mt-2 max-w-[240px] text-xs text-muted-foreground">{subscription.notes}</p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background px-4 py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-text">{value}</p>
    </div>
  );
}

function SubscriptionForm({
  title,
  description,
  formState,
  formError,
  submitLabel,
  onSubmit,
  onCancel,
  onChange,
}: {
  title: string;
  description: string;
  formState: SubscriptionFormState;
  formError: string | null;
  submitLabel: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onChange: (state: SubscriptionFormState) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-5 shadow-soft sm:p-6">
      <h3 className="text-lg font-semibold text-text">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <LabeledField label="Subscription Name">
          <input
            type="text"
            value={formState.name}
            onChange={(event) => onChange({ ...formState, name: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
            placeholder="Enter subscription name"
            required
          />
        </LabeledField>

        <LabeledField label="Plan Code">
          <input
            type="text"
            value={formState.planCode}
            onChange={(event) => onChange({ ...formState, planCode: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
            placeholder="e.g. PRO-100"
            required
          />
        </LabeledField>

        <LabeledField label="Amount (USD)">
          <input
            type="number"
            min="0"
            step="1"
            value={formState.amount}
            onChange={(event) => onChange({ ...formState, amount: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
            placeholder="0"
            required
          />
        </LabeledField>

        <LabeledField label="Billing Cycle">
          <select
            value={formState.billingCycle}
            onChange={(event) => onChange({ ...formState, billingCycle: event.target.value as BillingCycle })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </LabeledField>

        <LabeledField label="Max Users">
          <input
            type="number"
            min="1"
            step="1"
            value={formState.maxUsers}
            onChange={(event) => onChange({ ...formState, maxUsers: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
            placeholder="1"
            required
          />
        </LabeledField>

        <LabeledField label="Notes">
          <input
            type="text"
            value={formState.notes}
            onChange={(event) => onChange({ ...formState, notes: event.target.value })}
            className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-text outline-none focus:border-primary"
            placeholder="Optional notes"
          />
        </LabeledField>
      </div>

      {formError && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="submit">{submitLabel}</Button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function LabeledField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-sm text-text">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
