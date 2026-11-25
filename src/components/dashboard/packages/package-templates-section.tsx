"use client";

import { type FormEvent, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { formatPaiseInput, moneyToPaise, paiseToMoney, parseMoneyPaise } from "@/lib/package-ledger";
import {
  PACKAGE_LIMITS,
  PACKAGE_PAYMENT_PLANS,
  PACKAGE_PLAN_LABEL,
  formatPackageMoney,
  formatSessionCount,
  type PackageLabels,
  type PackagePaymentPlan,
  type PackageTemplatePayload,
  type PackageTemplateRecord,
} from "@/lib/package-types";
import { formatSupabaseError } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type TemplateForm = {
  name: string;
  sessionCount: string;
  plan: PackagePaymentPlan;
  price: string;
  validityDays: string;
  isActive: boolean;
};

const EMPTY_FORM: TemplateForm = { name: "", sessionCount: "", plan: "upfront", price: "", validityDays: "", isActive: true };

const inputClass =
  "w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text placeholder:text-muted-foreground sm:text-sm";

function toForm(template: PackageTemplateRecord): TemplateForm {
  const price = template.payment_plan === "per_visit" ? template.price_per_session : template.price_total;
  return {
    name: template.name,
    sessionCount: String(template.session_count),
    plan: template.payment_plan,
    price: price !== null ? formatPaiseInput(moneyToPaise(price)) : "",
    validityDays: template.validity_days !== null ? String(template.validity_days) : "",
    isActive: template.is_active,
  };
}

/**
 * Template catalog: reusable name, session count, default plan and prices, validity. Templates only pre-fill the sell
 * form; a sold package keeps its own snapshot, so editing or deleting a template never changes sold packages.
 * Writes go straight to package_templates under own-client RLS (a catalog with no money).
 */
export function PackageTemplatesSection({
  templates,
  loading,
  saving,
  loadError,
  labels,
  onCreate,
  onUpdate,
  onRemove,
}: {
  templates: PackageTemplateRecord[];
  loading: boolean;
  saving: boolean;
  loadError: string | null;
  labels: PackageLabels;
  onCreate: (payload: PackageTemplatePayload) => Promise<unknown>;
  onUpdate: (templateId: string, payload: PackageTemplatePayload) => Promise<unknown>;
  onRemove: (templateId: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);
  const [form, setForm] = useState<TemplateForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function openForm(template: PackageTemplateRecord | null) {
    setEditing({ id: template?.id ?? null });
    setForm(template ? toForm(template) : EMPTY_FORM);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !editing) {
      return;
    }

    const name = form.name.trim();
    if (!name || name.length > PACKAGE_LIMITS.nameMax) {
      setFormError(`Name is required (up to ${PACKAGE_LIMITS.nameMax} characters).`);
      return;
    }
    const count = /^\d{1,3}$/.test(form.sessionCount.trim()) ? Number(form.sessionCount.trim()) : Number.NaN;
    if (!(count >= PACKAGE_LIMITS.sessionsMin && count <= PACKAGE_LIMITS.sessionsMax)) {
      setFormError(`${labels.sessions} must be a whole number from 1 to ${PACKAGE_LIMITS.sessionsMax}.`);
      return;
    }
    const pricePaise = parseMoneyPaise(form.price);
    if (pricePaise === null || (form.plan === "per_visit" && pricePaise <= 0)) {
      setFormError(
        form.plan === "per_visit"
          ? `Enter the price per ${labels.session.toLowerCase()} (above zero, up to two decimals).`
          : "Enter the total price (up to two decimals).",
      );
      return;
    }
    const validity = form.validityDays.trim() ? Number(form.validityDays.trim()) : null;
    if (validity !== null && !(Number.isInteger(validity) && validity >= 1 && validity <= PACKAGE_LIMITS.validityDaysMax)) {
      setFormError(`Validity must be a whole number of days from 1 to ${PACKAGE_LIMITS.validityDaysMax}.`);
      return;
    }

    const payload: PackageTemplatePayload = {
      name,
      sessionCount: count,
      paymentPlan: form.plan,
      priceTotal: form.plan === "per_visit" ? null : paiseToMoney(pricePaise),
      pricePerSession: form.plan === "per_visit" ? paiseToMoney(pricePaise) : null,
      validityDays: validity,
      isActive: form.isActive,
    };

    try {
      setFormError(null);
      if (editing.id) {
        await onUpdate(editing.id, payload);
      } else {
        await onCreate(payload);
      }
      setEditing(null);
    } catch (saveError) {
      setFormError(formatSupabaseError(saveError, "Unable to save the template."));
    }
  }

  async function handleDelete(templateId: string) {
    try {
      setActionError(null);
      await onRemove(templateId);
      setConfirmDeleteId(null);
    } catch (removeError) {
      setActionError(formatSupabaseError(removeError, "Unable to delete the template."));
    }
  }

  async function handleToggleActive(template: PackageTemplateRecord) {
    try {
      setActionError(null);
      await onUpdate(template.id, {
        name: template.name,
        sessionCount: template.session_count,
        paymentPlan: template.payment_plan,
        priceTotal: template.price_total,
        pricePerSession: template.price_per_session,
        validityDays: template.validity_days,
        isActive: !template.is_active,
      });
    } catch (toggleError) {
      setActionError(formatSupabaseError(toggleError, "Unable to update the template."));
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-background">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-semibold text-text"
      >
        <span>
          {labels.package} templates
          {templates.length > 0 ? <span className="ml-2 font-normal text-muted-foreground">{templates.length}</span> : null}
        </span>
        <ChevronDown className={cn("h-4 w-4 transition", open && "rotate-180")} aria-hidden="true" />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border p-4">
          <p className="text-sm text-muted-foreground">
            Save common {labels.packages.toLowerCase()} once and pick them when selling. A sold {labels.package.toLowerCase()}{" "}
            keeps its own price and {labels.sessions.toLowerCase()}, so changing a template never changes past sales.
          </p>

          <button
            type="button"
            onClick={() => openForm(null)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-medium text-text hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Add template
          </button>

          {actionError && <p className="text-sm text-rose-400">{actionError}</p>}

          <DataState
            loading={loading && templates.length === 0}
            error={loadError}
            empty={templates.length === 0}
            emptyLabel="No templates yet."
          />

          {templates.length > 0 && (
            <ul className="space-y-2">
              {templates.map((template) => (
                <li
                  key={template.id}
                  className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium text-text">{template.name}</span>
                      {!template.is_active ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">Hidden</span>
                      ) : null}
                    </div>
                    <div className="text-muted-foreground">
                      {formatSessionCount(labels, template.session_count)} - {PACKAGE_PLAN_LABEL[template.payment_plan]}{" "}
                      {template.payment_plan === "per_visit"
                        ? `${formatPackageMoney(template.price_per_session)} per ${labels.session.toLowerCase()}`
                        : formatPackageMoney(template.price_total)}
                      {template.validity_days !== null ? ` - ${template.validity_days} days` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openForm(template)}
                      className="min-h-11 rounded-xl border border-border px-3 text-text hover:bg-muted xl:min-h-9"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleToggleActive(template)}
                      className="min-h-11 rounded-xl border border-border px-3 text-text hover:bg-muted disabled:opacity-60 xl:min-h-9"
                    >
                      {template.is_active ? "Hide" : "Show"}
                    </button>
                    {confirmDeleteId === template.id ? (
                      <>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleDelete(template.id)}
                          className="min-h-11 rounded-xl bg-rose-600 px-3 font-medium text-white disabled:opacity-60 xl:min-h-9"
                        >
                          Confirm delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="min-h-11 rounded-xl border border-border px-3 text-text hover:bg-muted xl:min-h-9"
                        >
                          Keep
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(template.id)}
                        className="min-h-11 rounded-xl border border-rose-500/40 px-3 text-rose-500 hover:bg-rose-500/10 xl:min-h-9"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <EntityModal
        open={editing !== null}
        title={editing?.id ? "Edit template" : "Add template"}
        onClose={() => setEditing(null)}
        contentClassName="sm:max-w-lg"
      >
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <label className="block space-y-1 text-sm text-muted-foreground">
            <span>Name *</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              maxLength={PACKAGE_LIMITS.nameMax}
              className={inputClass}
            />
          </label>

          <div className="space-y-1 text-sm text-muted-foreground">
            <span>Default payment plan</span>
            <div role="group" aria-label="Default payment plan" className="grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-background">
              {PACKAGE_PAYMENT_PLANS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={form.plan === option}
                  onClick={() => setForm((current) => ({ ...current, plan: option }))}
                  className={cn(
                    "min-h-11 px-2 text-sm font-medium transition",
                    form.plan === option ? "bg-primary/10 text-text" : "text-muted-foreground hover:bg-muted hover:text-text",
                  )}
                >
                  {PACKAGE_PLAN_LABEL[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Number of {labels.sessions.toLowerCase()} *</span>
              <input
                value={form.sessionCount}
                onChange={(event) => setForm((current) => ({ ...current, sessionCount: event.target.value.replace(/\D/g, "") }))}
                inputMode="numeric"
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>{form.plan === "per_visit" ? `Price per ${labels.session.toLowerCase()} *` : "Total price *"}</span>
              <input
                value={form.price}
                onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                inputMode="decimal"
                placeholder="0.00"
                className={inputClass}
              />
            </label>
            <label className="space-y-1 text-sm text-muted-foreground">
              <span>Valid for (days)</span>
              <input
                value={form.validityDays}
                onChange={(event) => setForm((current) => ({ ...current, validityDays: event.target.value.replace(/\D/g, "") }))}
                inputMode="numeric"
                placeholder="No expiry"
                className={inputClass}
              />
            </label>
            <label className="flex min-h-11 items-end gap-2 pb-2 text-sm text-text">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                className="h-5 w-5"
              />
              Available when selling
            </label>
          </div>

          {formError && <p className="text-sm text-rose-400">{formError}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setEditing(null)}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground hover:bg-muted sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-11 w-full rounded-xl border border-border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {saving ? "Saving..." : "Save template"}
            </button>
          </div>
        </form>
      </EntityModal>
    </div>
  );
}
