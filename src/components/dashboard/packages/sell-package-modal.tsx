"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import {
  InstallmentScheduleEditor,
  describeScheduleFailure,
  draftToRows,
  type ScheduleDraftRow,
} from "@/components/dashboard/packages/installment-schedule-editor";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { fetchCustomersPage } from "@/lib/billing-queries";
import type { CustomerRecord } from "@/lib/billing-types";
import { CLINIC_PAYMENT_MODES } from "@/lib/clinic-billing-types";
import {
  computeValidUntil,
  formatPaiseInput,
  moneyToPaise,
  paiseToMoney,
  parseMoneyPaise,
  validateInstallmentSchedule,
} from "@/lib/package-ledger";
import {
  PACKAGE_LIMITS,
  PACKAGE_PAYMENT_PLANS,
  PACKAGE_PLAN_LABEL,
  formatPackageMoney,
  formatSessionCount,
  type PackageLabels,
  type PackagePaymentMethod,
  type PackagePaymentPlan,
  type PackageTemplateRecord,
  type SellPackagePayload,
} from "@/lib/package-types";
import { newIdempotencyKey } from "@/lib/package-queries";
import { formatSupabaseError } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type PickedCustomer = { id: string; name: string; phone: string | null };

type SellFormState = {
  name: string;
  sessions: string;
  price: string;
  pricePerSession: string;
  validityDays: string;
  note: string;
};

const EMPTY_FORM: SellFormState = { name: "", sessions: "", price: "", pricePerSession: "", validityDays: "", note: "" };

const inputClass =
  "w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text placeholder:text-muted-foreground sm:text-sm";

/** Customer search with server-side suggestions (same pattern as the appointment form's customer picker). */
function CustomerSearchField({
  clientId,
  picked,
  onPick,
}: {
  clientId: string;
  picked: PickedCustomer | null;
  onPick: (customer: PickedCustomer | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<CustomerRecord[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const debouncedQuery = useDebouncedValue(query, 250);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    if (!open || !clientId) {
      setLoading(false);
      return;
    }
    // Ignore stale responses when the query changes mid-flight.
    let cancelled = false;
    setLoading(true);
    fetchCustomersPage(clientId, { limit: 8, offset: 0, search: debouncedQuery })
      .then((result) => {
        if (!cancelled) setSuggestions(result.items);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, debouncedQuery, open]);

  if (picked) {
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm text-text">
        <span className="min-w-0 truncate">
          {picked.name}
          {picked.phone ? <span className="ml-2 text-muted-foreground">{picked.phone}</span> : null}
        </span>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-muted hover:text-text xl:h-8 xl:w-8"
          aria-label="Change customer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search customers by name or phone"
          aria-label="Search customers"
          autoComplete="off"
          className="min-h-11 w-full bg-transparent text-base text-text outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : null}
      </div>
      {open && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-border bg-card shadow-soft">
          {suggestions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {loading ? "Searching..." : "No matching customers. Add the customer on the Customers tab first."}
            </p>
          ) : (
            <ul role="listbox">
              {suggestions.map((customer) => (
                <li key={customer.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      onPick({ id: customer.id, name: customer.name, phone: customer.phone });
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm text-text hover:bg-muted"
                  >
                    <span className="truncate">{customer.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{customer.phone ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function parseWholeNumber(raw: string, min: number, max: number): number | null {
  const text = raw.trim();
  if (!/^\d{1,4}$/.test(text)) {
    return null;
  }
  const value = Number(text);
  return value >= min && value <= max ? value : null;
}

const PLAN_HELP: Record<PackagePaymentPlan, string> = {
  upfront: "One price for the whole package. Payments can be recorded any time, up to the price.",
  installments: "A due-dated schedule that adds up to the price. Overdue amounts are highlighted.",
  per_visit: "Nothing is owed up front. Each completed visit (or charged forfeit) adds the price per visit.",
};

export function SellPackageModal({
  open,
  clientId,
  labels,
  today,
  saving,
  templates,
  onClose,
  onSell,
}: {
  open: boolean;
  clientId: string;
  labels: PackageLabels;
  /** Today in the clinic time zone (yyyy-mm-dd); expiry and installment dates are counted from here. */
  today: string;
  saving: boolean;
  /** Active catalog templates; picking one pre-fills the form (every field stays editable). */
  templates: PackageTemplateRecord[];
  onClose: () => void;
  onSell: (payload: SellPackagePayload) => Promise<unknown>;
}) {
  const [customer, setCustomer] = useState<PickedCustomer | null>(null);
  const [form, setForm] = useState<SellFormState>(EMPTY_FORM);
  const [plan, setPlan] = useState<PackagePaymentPlan>("upfront");
  const [templateId, setTemplateId] = useState("");
  const [schedule, setSchedule] = useState<ScheduleDraftRow[]>([]);
  const [collect, setCollect] = useState(false);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState<PackagePaymentMethod>("CASH");
  const [formError, setFormError] = useState<string | null>(null);
  // Local pending flag: disables submit the moment it is pressed (the hook's saving flag follows a render later).
  const [pending, setPending] = useState(false);
  // One key per distinct sale: a retry of an unchanged form (for example after a timeout) reuses it, so the database
  // returns the stored package instead of selling twice. Editing any field makes a new sale and a new key.
  const attemptRef = useRef<{ signature: string; key: string } | null>(null);

  useEffect(() => {
    if (open) {
      attemptRef.current = null;
      setPending(false);
      setCustomer(null);
      setForm(EMPTY_FORM);
      setPlan("upfront");
      setTemplateId("");
      setSchedule([]);
      setCollect(false);
      setCollectAmount("");
      setCollectMethod("CASH");
      setFormError(null);
    }
  }, [open]);

  // A validation message describes the form as it was when submitted; editing anything makes it stale.
  useEffect(() => {
    setFormError(null);
  }, [customer, form, plan, templateId, schedule, collect, collectAmount, collectMethod]);

  const sessions = parseWholeNumber(form.sessions, PACKAGE_LIMITS.sessionsMin, PACKAGE_LIMITS.sessionsMax);
  const pricePaise = parseMoneyPaise(form.price);
  const perVisitPaise = parseMoneyPaise(form.pricePerSession);
  const validityDays = form.validityDays.trim()
    ? parseWholeNumber(form.validityDays, 1, PACKAGE_LIMITS.validityDaysMax)
    : null;
  const validUntil = computeValidUntil(today, validityDays);
  const planTotalPaise = plan === "per_visit" ? null : pricePaise;

  function applyTemplate(nextId: string) {
    setTemplateId(nextId);
    const template = templates.find((item) => item.id === nextId);
    if (!template) {
      return;
    }
    setPlan(template.payment_plan);
    setSchedule([]);
    setCollect(false);
    setCollectAmount("");
    setForm((current) => ({
      ...current,
      name: template.name,
      sessions: String(template.session_count),
      price: template.price_total !== null ? formatPaiseInput(moneyToPaise(template.price_total)) : "",
      pricePerSession:
        template.price_per_session !== null ? formatPaiseInput(moneyToPaise(template.price_per_session)) : "",
      validityDays: template.validity_days !== null ? String(template.validity_days) : "",
    }));
  }

  function changePlan(next: PackagePaymentPlan) {
    setPlan(next);
    setSchedule([]);
    setCollect(false);
    setCollectAmount("");
    setFormError(null);
  }

  function toggleCollect(next: boolean) {
    setCollect(next);
    if (!next) {
      return;
    }
    const first = plan === "installments" ? parseMoneyPaise(schedule[0]?.amount ?? "") : pricePaise;
    setCollectAmount(first !== null && first > 0 ? formatPaiseInput(first) : "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || pending) {
      return;
    }

    if (!customer) {
      setFormError("Pick a customer.");
      return;
    }
    const name = form.name.trim();
    if (!name || name.length > PACKAGE_LIMITS.nameMax) {
      setFormError(`${labels.package} name is required (up to ${PACKAGE_LIMITS.nameMax} characters).`);
      return;
    }
    if (sessions === null) {
      setFormError(`${labels.sessions} must be a whole number from 1 to ${PACKAGE_LIMITS.sessionsMax}.`);
      return;
    }
    if (plan === "per_visit") {
      if (perVisitPaise === null || perVisitPaise <= 0) {
        setFormError(`Enter the price per ${labels.session.toLowerCase()} (above zero, up to two decimals).`);
        return;
      }
    } else if (pricePaise === null) {
      setFormError("Enter the total price (up to two decimals).");
      return;
    }
    if (form.validityDays.trim() && validityDays === null) {
      setFormError(`Validity must be a whole number of days from 1 to ${PACKAGE_LIMITS.validityDaysMax}.`);
      return;
    }
    if (form.note.trim().length > PACKAGE_LIMITS.noteMax) {
      setFormError(`Notes must be ${PACKAGE_LIMITS.noteMax} characters or fewer.`);
      return;
    }

    let installments: SellPackagePayload["installments"] = null;
    if (plan === "installments") {
      const rows = draftToRows(schedule);
      const check = validateInstallmentSchedule(rows, pricePaise ?? 0, today);
      if (!check.ok) {
        setFormError(describeScheduleFailure(check.reason));
        return;
      }
      installments = rows;
    }

    let initialPayment: SellPackagePayload["initialPayment"] = null;
    if (collect && plan !== "per_visit") {
      const amountPaise = parseMoneyPaise(collectAmount);
      if (amountPaise === null || amountPaise <= 0) {
        setFormError("Enter the amount collected now (above zero, up to two decimals).");
        return;
      }
      if (amountPaise > (pricePaise ?? 0)) {
        setFormError("The amount collected now cannot be more than the price.");
        return;
      }
      initialPayment = { amountPaise, method: collectMethod, note: null };
    }

    const sale: Omit<SellPackagePayload, "idempotencyKey"> = {
      customerId: customer.id,
      name,
      sessionsTotal: sessions,
      paymentPlan: plan,
      priceTotal: plan === "per_visit" ? null : paiseToMoney(pricePaise ?? 0),
      pricePerSession: plan === "per_visit" ? paiseToMoney(perVisitPaise ?? 0) : null,
      validUntil,
      templateId: templateId || null,
      note: form.note.trim() || null,
      installments,
      initialPayment,
    };
    const signature = JSON.stringify(sale);
    if (attemptRef.current?.signature !== signature) {
      attemptRef.current = { signature, key: newIdempotencyKey() };
    }

    try {
      setFormError(null);
      setPending(true);
      await onSell({ ...sale, idempotencyKey: attemptRef.current.key });
      attemptRef.current = null;
      onClose();
    } catch (sellError) {
      setFormError(formatSupabaseError(sellError, `Unable to sell the ${labels.package.toLowerCase()}.`));
    } finally {
      setPending(false);
    }
  }

  return (
    <EntityModal open={open} title={`Sell ${labels.package.toLowerCase()}`} onClose={onClose} contentClassName="sm:max-w-xl">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="space-y-1 text-sm text-muted-foreground">
          <span>Customer *</span>
          <CustomerSearchField clientId={clientId} picked={customer} onPick={setCustomer} />
        </div>

        {templates.length > 0 && (
          <label className="block space-y-1 text-sm text-muted-foreground">
            <span>Start from a template</span>
            <select value={templateId} onChange={(event) => applyTemplate(event.target.value)} className={inputClass}>
              <option value="">Custom (no template)</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} - {formatSessionCount(labels, template.session_count)}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block space-y-1 text-sm text-muted-foreground">
          <span>{labels.package} name *</span>
          <input
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            maxLength={PACKAGE_LIMITS.nameMax}
            placeholder={`For example: 6 ${labels.sessions.toLowerCase()} physiotherapy`}
            className={inputClass}
          />
        </label>

        <div className="space-y-1 text-sm text-muted-foreground">
          <span>Payment plan</span>
          <div role="group" aria-label="Payment plan" className="grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-background">
            {PACKAGE_PAYMENT_PLANS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={plan === option}
                onClick={() => changePlan(option)}
                className={cn(
                  "min-h-11 px-2 text-sm font-medium transition",
                  plan === option ? "bg-primary/10 text-text" : "text-muted-foreground hover:bg-muted hover:text-text",
                )}
              >
                {PACKAGE_PLAN_LABEL[option]}
              </button>
            ))}
          </div>
          <p className="text-xs">{PLAN_HELP[plan]}</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm text-muted-foreground">
            <span>Number of {labels.sessions.toLowerCase()} *</span>
            <input
              value={form.sessions}
              onChange={(event) => setForm((current) => ({ ...current, sessions: event.target.value.replace(/\D/g, "") }))}
              inputMode="numeric"
              placeholder="6"
              className={inputClass}
            />
          </label>
          {plan === "per_visit" ? (
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Price per {labels.session.toLowerCase()} *</span>
              <input
                value={form.pricePerSession}
                onChange={(event) => setForm((current) => ({ ...current, pricePerSession: event.target.value }))}
                inputMode="decimal"
                placeholder="0.00"
                className={inputClass}
              />
            </label>
          ) : (
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Total price *</span>
              <input
                value={form.price}
                onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                inputMode="decimal"
                placeholder="0.00"
                className={inputClass}
              />
            </label>
          )}
          <label className="space-y-1 text-sm text-muted-foreground">
            <span>Valid for (days)</span>
            <input
              value={form.validityDays}
              onChange={(event) =>
                setForm((current) => ({ ...current, validityDays: event.target.value.replace(/\D/g, "") }))
              }
              inputMode="numeric"
              placeholder="No expiry"
              className={inputClass}
            />
          </label>
        </div>

        <p className="text-sm text-muted-foreground">
          {validUntil ? `Expires after ${validUntil}.` : "No expiry date."}
          {plan !== "per_visit" && sessions !== null && pricePaise !== null && sessions > 0
            ? ` ${formatPackageMoney(Math.round(pricePaise / sessions) / 100)} per ${labels.session.toLowerCase()}.`
            : ""}
          {plan === "per_visit" && sessions !== null && perVisitPaise !== null
            ? ` At most ${formatPackageMoney((perVisitPaise * sessions) / 100)} if every ${labels.session.toLowerCase()} is used.`
            : ""}
        </p>

        {plan === "installments" && (
          <InstallmentScheduleEditor totalPaise={planTotalPaise} today={today} rows={schedule} onChange={setSchedule} />
        )}

        {plan !== "per_visit" && (
          <div className="space-y-2 rounded-xl border border-border bg-background p-3">
            <label className="flex min-h-11 items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={collect}
                onChange={(event) => toggleCollect(event.target.checked)}
                className="h-5 w-5"
              />
              Collect a payment now
            </label>
            {collect && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm text-muted-foreground">
                  <span>Amount collected</span>
                  <input
                    value={collectAmount}
                    onChange={(event) => setCollectAmount(event.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    className={inputClass}
                  />
                </label>
                <label className="space-y-1 text-sm text-muted-foreground">
                  <span>Method</span>
                  <select
                    value={collectMethod}
                    onChange={(event) => setCollectMethod(event.target.value as PackagePaymentMethod)}
                    className={inputClass}
                  >
                    {CLINIC_PAYMENT_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        )}

        <label className="block space-y-1 text-sm text-muted-foreground">
          <span>Notes</span>
          <textarea
            value={form.note}
            onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
            maxLength={PACKAGE_LIMITS.noteMax}
            className="min-h-20 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:text-sm"
          />
        </label>

        {formError && <p className="text-sm text-rose-400">{formError}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground hover:bg-muted sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || pending}
            className="min-h-11 w-full rounded-xl border border-border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {saving || pending ? "Saving..." : `Sell ${labels.package.toLowerCase()}`}
          </button>
        </div>
      </form>
    </EntityModal>
  );
}
