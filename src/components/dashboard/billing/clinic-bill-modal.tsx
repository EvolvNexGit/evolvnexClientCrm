"use client";

import { Loader2, Minus, Plus, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { ClinicReceiptPrint } from "@/components/dashboard/print/clinic-receipt-print";
import { PrintSheet } from "@/components/dashboard/print/print-sheet";
import { Button } from "@/components/ui/button";
import { useClinicReceiptPrint } from "@/hooks/use-clinic-receipt-print";
import { fetchProducts } from "@/lib/billing-queries";
import type { ProductRecord } from "@/lib/billing-types";
import { createClinicBill } from "@/lib/clinic-billing-queries";
import {
  CLINIC_ALREADY_BILLED_MESSAGE,
  CLINIC_BILL_MAX_ITEMS,
  CLINIC_BILL_MAX_QUANTITY,
  CLINIC_PAYMENT_MODES,
  computeTotalsPaise,
  describeClinicPayment,
  isClinicPaymentMode,
  parseMoneyInput,
  parseQuantity,
  toPaise,
  type ClinicBillPayload,
  type CreatedClinicBill,
} from "@/lib/clinic-billing-types";

type ClinicBillModalProps = {
  open: boolean;
  clientId: string;
  patientId: string;
  patientName: string;
  consultationId: string;
  onClose: () => void;
  onCreated?: (bill: CreatedClinicBill) => void;
};

type BillLine = {
  key: number;
  productId: string;
  quantity: string;
};

const inrFormatter = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });

function formatRupees(amount: number) {
  return inrFormatter.format(amount);
}

function formatPaise(paise: number) {
  return inrFormatter.format(paise / 100);
}

type QuantityStepperProps = {
  id: string;
  value: string;
  disabled: boolean;
  ariaLabel: string;
  onChange: (next: string) => void;
};

/** Minus / typeable input / plus. Quantity is clamped to 1..99 and never left blank. */
function QuantityStepper({ id, value, disabled, ariaLabel, onChange }: QuantityStepperProps) {
  const current = parseQuantity(value);
  const buttonClass =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-border bg-card text-text hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={disabled || current === null || current <= 1}
        onClick={() => onChange(String(Math.max(1, (current ?? 2) - 1)))}
        className={buttonClass}
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        maxLength={2}
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
        onBlur={() => {
          if (parseQuantity(value) === null) {
            onChange("1");
          }
        }}
        className="min-h-11 w-10 rounded-xl border border-border bg-background px-1 text-center text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={disabled || (current !== null && current >= CLINIC_BILL_MAX_QUANTITY)}
        onClick={() => onChange(String(Math.min(CLINIC_BILL_MAX_QUANTITY, (current ?? 0) + 1)))}
        className={buttonClass}
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

type CreatedPanelProps = {
  clientId: string;
  bill: CreatedClinicBill;
  onClose: () => void;
};

/** Mounted only once a bill exists, so print settings are fetched after creation, not on open. */
function CreatedPanel({ clientId, bill, onClose }: CreatedPanelProps) {
  const { printPayload, margins, ready, hasSavedSettings, printingId, printError, printBill } =
    useClinicReceiptPrint(clientId);
  const paymentLabel = describeClinicPayment(bill.paymentStatus, bill.paymentMode);

  return (
    <div className="space-y-4">
      <div className="space-y-1 rounded-2xl border border-border bg-background p-4">
        <p className="text-sm font-semibold text-text">Bill created</p>
        <p className="text-sm text-muted-foreground">Receipt number: {bill.orderId ?? "-"}</p>
        <p className="text-sm text-text">Total: {formatRupees(bill.finalAmount)}</p>
        {paymentLabel ? <p className="text-sm text-text">{paymentLabel}</p> : null}
      </div>
      {ready && !hasSavedSettings ? (
        <p className="rounded-xl border border-border bg-background p-3 text-sm text-muted-foreground">
          Print settings are not saved yet, so this receipt prints with 0 mm margins. Close this dialog and set them
          under Print settings in Consultations first.
        </p>
      ) : null}
      {printError ? (
        <p role="alert" className="text-sm text-primary">
          {printError}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="gap-2"
          disabled={!ready || printingId !== null}
          title={ready ? "Print receipt" : "Print settings are not loaded"}
          onClick={() => void printBill(bill.billId)}
        >
          {printingId === bill.billId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          Print receipt
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
      {printPayload ? (
        <PrintSheet margins={margins}>
          <ClinicReceiptPrint bill={printPayload} />
        </PrintSheet>
      ) : null}
    </div>
  );
}

type ClinicBillBodyProps = Omit<ClinicBillModalProps, "open"> & {
  onSavingChange: (saving: boolean) => void;
};

/** Mounted only while the modal is open, so its state and product fetch never outlive the dialog. */
function ClinicBillBody({
  clientId,
  patientId,
  patientName,
  consultationId,
  onClose,
  onCreated,
  onSavingChange,
}: ClinicBillBodyProps) {
  const idPrefix = useId();
  const nextKey = useRef(1);
  const savingRef = useRef(false);
  const [products, setProducts] = useState<ProductRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [lines, setLines] = useState<BillLine[]>([]);
  const [discountText, setDiscountText] = useState("0");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "unpaid">("paid");
  const [paymentMode, setPaymentMode] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedClinicBill | null>(null);

  // The modal shell blocks backdrop/Close dismissal while the create request is in flight (WR-03).
  useEffect(() => {
    onSavingChange(saving);
  }, [saving, onSavingChange]);

  useEffect(() => {
    let cancelled = false;
    setProducts(null);
    setLoadError(null);

    fetchProducts(clientId)
      .then((loaded) => {
        if (cancelled) {
          return;
        }

        setProducts(loaded);
        // D-01: one fee item means the receptionist does not have to pick it.
        const only = loaded.length === 1 ? loaded[0] : null;
        setLines([{ key: nextKey.current++, productId: only ? only.id : "", quantity: "1" }]);
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setLoadError(fetchError instanceof Error ? fetchError.message : "Unable to load fee items.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, reloadToken]);

  const priceById = useMemo(() => new Map((products ?? []).map((product) => [product.id, product])), [products]);

  const lineStates = lines.map((line) => {
    const product = priceById.get(line.productId) ?? null;
    const quantity = parseQuantity(line.quantity);
    return {
      line,
      product,
      quantity,
      valid: product !== null && quantity !== null,
      pricePaise: product ? toPaise(product.price) : 0,
    };
  });

  const allLinesValid = lineStates.length > 0 && lineStates.every((state) => state.valid);
  const discountPaise = discountText.trim() === "" ? 0 : parseMoneyInput(discountText);
  const totals = computeTotalsPaise(
    lineStates.filter((state) => state.valid).map((state) => ({ pricePaise: state.pricePaise, quantity: state.quantity ?? 0 })),
    discountPaise ?? 0,
  );
  const discountError = discountPaise === null ? "Enter a valid amount, up to two decimals." : totals.error;
  const modeChosen = isClinicPaymentMode(paymentMode);
  const paymentValid = paymentStatus === "unpaid" || modeChosen;
  const canSubmit = allLinesValid && discountError === null && paymentValid && patientId !== "" && !saving;
  const usedProductIds = new Set(lines.map((line) => line.productId).filter((id) => id !== ""));
  const canAddLine =
    lines.length < CLINIC_BILL_MAX_ITEMS && (products ?? []).some((product) => !usedProductIds.has(product.id));

  const updateLine = useCallback((key: number, patch: Partial<Omit<BillLine, "key">>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }, []);

  const handleAddLine = () => {
    setLines((current) => [...current, { key: nextKey.current++, productId: "", quantity: "1" }]);
  };

  const handleRemoveLine = (key: number) => {
    setLines((current) => (current.length > 1 ? current.filter((line) => line.key !== key) : current));
  };

  const handleSubmit = async () => {
    if (savingRef.current || !canSubmit || discountPaise === null) {
      return;
    }

    const items: ClinicBillPayload["items"] = [];
    for (const state of lineStates) {
      if (!state.product || state.quantity === null) {
        return;
      }

      items.push({ productId: state.product.id, quantity: state.quantity });
    }

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const bill = await createClinicBill(clientId, {
        customerId: patientId,
        consultationId,
        items,
        discount: discountPaise / 100,
        paymentStatus,
        paymentMode: paymentStatus === "paid" && isClinicPaymentMode(paymentMode) ? paymentMode : null,
      });
      setCreated(bill);
      onCreated?.(bill);
    } catch (saveFailure) {
      setSaveError(saveFailure instanceof Error ? saveFailure.message : "Unable to create the bill.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (created) {
    return <CreatedPanel clientId={clientId} bill={created} onClose={onClose} />;
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-primary">
          {loadError}
        </p>
        <Button variant="secondary" onClick={() => setReloadToken((token) => token + 1)}>
          Retry
        </Button>
      </div>
    );
  }

  if (products === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading fee items...
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-text">No fee items yet</p>
        <p className="text-sm text-muted-foreground">
          No fee items yet. Create your consultation fee as an item in Services first, then come back to bill this
          consultation.
        </p>
        <Link
          href="/dashboard/product"
          className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-text hover:bg-muted"
        >
          Open Services
        </Link>
      </div>
    );
  }

  const inputClass =
    "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/40";

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-sm font-medium text-text">Patient</p>
        <p className="text-sm text-muted-foreground">{patientName}</p>
      </div>

      <div className="space-y-3">
        {lineStates.map((state, index) => (
          <div key={state.line.key} className="space-y-2 rounded-2xl border border-border bg-background p-3">
            <div className="space-y-1">
              <label htmlFor={`${idPrefix}-item-${state.line.key}`} className="text-sm font-medium text-text">
                Item {index + 1}
              </label>
              <select
                id={`${idPrefix}-item-${state.line.key}`}
                value={state.line.productId}
                disabled={saving}
                onChange={(event) => updateLine(state.line.key, { productId: event.target.value })}
                className={inputClass}
              >
                <option value="">Select item</option>
                {products.map((product) => (
                  <option
                    key={product.id}
                    value={product.id}
                    disabled={product.id !== state.line.productId && usedProductIds.has(product.id)}
                  >
                    {product.name} - {formatRupees(product.price)}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <QuantityStepper
                id={`${idPrefix}-qty-${state.line.key}`}
                value={state.line.quantity}
                disabled={saving}
                ariaLabel={`Quantity for item ${index + 1}`}
                onChange={(next) => updateLine(state.line.key, { quantity: next })}
              />
              <p className="min-w-0 flex-1 text-right text-xs font-medium tabular-nums text-text sm:text-sm">
                {state.valid ? formatPaise(state.pricePaise * (state.quantity ?? 0)) : "-"}
              </p>
              {lines.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove item ${index + 1}`}
                  disabled={saving}
                  onClick={() => handleRemoveLine(state.line.key)}
                  className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:bg-muted hover:text-text focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {canAddLine ? (
          <Button variant="secondary" disabled={saving} onClick={handleAddLine}>
            Add item
          </Button>
        ) : null}
      </div>

      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-discount`} className="text-sm font-medium text-text">
          Discount (INR)
        </label>
        <input
          id={`${idPrefix}-discount`}
          type="text"
          inputMode="decimal"
          value={discountText}
          disabled={saving}
          onChange={(event) => setDiscountText(event.target.value)}
          className={inputClass}
        />
        {discountError ? (
          <p role="alert" className="text-sm text-primary">
            {discountError}
          </p>
        ) : null}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-text">Payment</legend>
        <div className="flex gap-2">
          {(["paid", "unpaid"] as const).map((status) => (
            <Button
              key={status}
              variant={paymentStatus === status ? "primary" : "secondary"}
              aria-pressed={paymentStatus === status}
              disabled={saving}
              onClick={() => setPaymentStatus(status)}
            >
              {status === "paid" ? "Paid" : "Unpaid"}
            </Button>
          ))}
        </div>
        {paymentStatus === "paid" ? (
          <div className="space-y-1">
            <label htmlFor={`${idPrefix}-mode`} className="text-sm font-medium text-text">
              Payment mode
            </label>
            <select
              id={`${idPrefix}-mode`}
              value={paymentMode}
              disabled={saving}
              onChange={(event) => setPaymentMode(event.target.value)}
              className={inputClass}
            >
              <option value="">Select payment mode</option>
              {CLINIC_PAYMENT_MODES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </fieldset>

      <dl className="space-y-1 rounded-2xl border border-border bg-background p-3 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="text-text">{formatPaise(totals.subtotalPaise)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Discount</dt>
          <dd className="text-text">{formatPaise(discountError === null ? totals.discountPaise : 0)}</dd>
        </div>
        <div className="flex justify-between gap-3 font-semibold">
          <dt className="text-text">Total</dt>
          <dd className="text-text">{formatPaise(discountError === null ? totals.totalPaise : totals.subtotalPaise)}</dd>
        </div>
      </dl>

      {saveError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-primary">
            {saveError}
          </p>
          {saveError === CLINIC_ALREADY_BILLED_MESSAGE ? (
            <Link
              href="/dashboard/doctor-billing"
              className="inline-flex min-h-11 items-center rounded-xl border border-border bg-card px-4 text-sm font-medium text-text hover:bg-muted"
            >
              Open Billing
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button disabled={!canSubmit} onClick={() => void handleSubmit()}>
          {saving ? "Creating..." : "Create bill"}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function ClinicBillModal({
  open,
  clientId,
  patientId,
  patientName,
  consultationId,
  onClose,
  onCreated,
}: ClinicBillModalProps) {
  const [saving, setSaving] = useState(false);

  return (
    <EntityModal
      open={open}
      title="Create bill"
      onClose={() => {
        if (!saving) {
          onClose();
        }
      }}
      contentClassName="sm:max-w-xl"
    >
      <ClinicBillBody
        clientId={clientId}
        patientId={patientId}
        patientName={patientName}
        consultationId={consultationId}
        onClose={onClose}
        onCreated={onCreated}
        onSavingChange={setSaving}
      />
    </EntityModal>
  );
}
