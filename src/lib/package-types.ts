/**
 * Package and session domain types (Wave 3, D-05, D-06). Import-free and erasable TypeScript only, so the
 * assertion scripts and the pure ledger module can load it directly.
 *
 * Vocabulary is generic: a package is a bundle of N sessions sold to one customer. Tenants rename the words through
 * the client_settings packages namespace (labels), so the same screens serve clinics, salons, gyms and tutors.
 */

export const PACKAGE_PAYMENT_PLANS = ["upfront", "installments", "per_visit"] as const;
export type PackagePaymentPlan = (typeof PACKAGE_PAYMENT_PLANS)[number];

/** Payment kind stored on a ledger row; fixed by the plan (upfront -> upfront, installments -> installment, per_visit -> per_visit). */
export const PACKAGE_PAYMENT_KINDS = ["upfront", "installment", "per_visit"] as const;
export type PackagePaymentKind = (typeof PACKAGE_PAYMENT_KINDS)[number];

export const PAYMENT_KIND_FOR_PLAN: Record<PackagePaymentPlan, PackagePaymentKind> = {
  upfront: "upfront",
  installments: "installment",
  per_visit: "per_visit",
};

/**
 * Payment methods. Same vocabulary as CLINIC_PAYMENT_MODES in clinic-billing-types.ts (this module stays import-free so
 * Node can load it; scripts/check-package-ledger.mjs asserts the two lists are equal).
 */
export const PACKAGE_PAYMENT_METHODS = ["CASH", "UPI", "CARD", "OTHER"] as const;
export type PackagePaymentMethod = (typeof PACKAGE_PAYMENT_METHODS)[number];

export const PACKAGE_STATUSES = ["active", "completed", "cancelled"] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

/** Display status: expired is derived (valid_until passed and not completed or cancelled), never stored. */
export type PackageDisplayStatus = PackageStatus | "expired";

export const PACKAGE_SESSION_STATUSES = [
  "scheduled",
  "completed",
  "missed_pending",
  "rolled_over",
  "forfeited",
  "voided",
] as const;
export type PackageSessionStatus = (typeof PACKAGE_SESSION_STATUSES)[number];

export const MISSED_RESOLUTIONS = ["rollover", "forfeit"] as const;
export type MissedResolution = (typeof MISSED_RESOLUTIONS)[number];

export const MISSED_REASONS = ["cancelled", "no_show"] as const;
export type MissedReason = (typeof MISSED_REASONS)[number];

/** Bounds mirror the CHECK constraints and RPC validation in supabase/migrations/20261120_packages_*.sql. */
export const PACKAGE_LIMITS = {
  nameMax: 120,
  sessionsMin: 1,
  sessionsMax: 500,
  noteMax: 500,
  priceMax: 99999999.99,
  validityDaysMax: 3650,
  listMax: 200,
  installmentsMin: 1,
  installmentsMax: 120,
  /** Installment due dates may be backdated up to this many days and set at most installmentDaysAhead ahead. */
  installmentDaysBack: 366,
  installmentDaysAhead: 3660,
  idempotencyKeyMax: 100,
} as const;

/** Tenant vocabulary (client_settings packages.labels); defaults when nothing is configured. */
export type PackageLabels = {
  package: string;
  packages: string;
  session: string;
  sessions: string;
};

export const DEFAULT_PACKAGE_LABELS: PackageLabels = {
  package: "Package",
  packages: "Packages",
  session: "Session",
  sessions: "Sessions",
};

/** "1 Session" / "3 Sessions" with the tenant's words. */
export function formatSessionCount(labels: PackageLabels, count: number): string {
  return `${count} ${count === 1 ? labels.session : labels.sessions}`;
}

/** Money display for package prices (the clinic billing vocabulary is INR). */
export function formatPackageMoney(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount)) {
    return "-";
  }
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
}

export function isPackagePaymentPlan(value: unknown): value is PackagePaymentPlan {
  return typeof value === "string" && (PACKAGE_PAYMENT_PLANS as readonly string[]).includes(value);
}

export function isPackagePaymentKind(value: unknown): value is PackagePaymentKind {
  return typeof value === "string" && (PACKAGE_PAYMENT_KINDS as readonly string[]).includes(value);
}

export function isPackagePaymentMethod(value: unknown): value is PackagePaymentMethod {
  return typeof value === "string" && (PACKAGE_PAYMENT_METHODS as readonly string[]).includes(value);
}

export const PACKAGE_PLAN_LABEL: Record<PackagePaymentPlan, string> = {
  upfront: "Upfront",
  installments: "Installments",
  per_visit: "Per visit",
};

export function isPackageStatus(value: unknown): value is PackageStatus {
  return typeof value === "string" && (PACKAGE_STATUSES as readonly string[]).includes(value);
}

export function isPackageSessionStatus(value: unknown): value is PackageSessionStatus {
  return typeof value === "string" && (PACKAGE_SESSION_STATUSES as readonly string[]).includes(value);
}

export function isMissedResolution(value: unknown): value is MissedResolution {
  return typeof value === "string" && (MISSED_RESOLUTIONS as readonly string[]).includes(value);
}

/** customer_packages row plus the customer's display fields (embedded read). */
export type CustomerPackageRecord = {
  id: string;
  client_id: string;
  customer_id: string;
  template_id: string | null;
  name_snapshot: string;
  sessions_total: number;
  payment_plan: PackagePaymentPlan;
  price_total: number | null;
  price_per_session: number | null;
  valid_until: string | null;
  status: PackageStatus;
  note: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  customerName: string | null;
  customerPhone: string | null;
};

/** package_sessions row plus the linked appointment's display fields (embedded read). */
export type PackageSessionRecord = {
  id: string;
  client_id: string;
  package_id: string;
  appointment_id: string | null;
  status: PackageSessionStatus;
  missed_reason: MissedReason | null;
  resolution: MissedResolution | null;
  resolution_overrode_default: boolean;
  validity_extended_days: number;
  charge_on_forfeit: boolean | null;
  note: string | null;
  completed_at: string | null;
  missed_at: string | null;
  resolved_at: string | null;
  voided_at: string | null;
  created_at: string;
  appointmentDate: string | null;
  appointmentStartTime: string | null;
  appointmentStatus: string | null;
  appointmentName: string | null;
  appointmentService: string | null;
};

/** Undecided session with the package and customer context the decision dialog needs. */
export type PendingDecisionRecord = PackageSessionRecord & {
  packageName: string;
  customerName: string | null;
};

/** package_installments row (due-dated schedule; amounts in rupees as stored, compared in integer paise). */
export type PackageInstallmentRecord = {
  id: string;
  package_id: string;
  seq: number;
  due_on: string;
  amount: number;
};

/** package_payments row (append-only money ledger). */
export type PackagePaymentRecord = {
  id: string;
  package_id: string;
  kind: PackagePaymentKind;
  amount: number;
  method: PackagePaymentMethod;
  paid_at: string;
  session_id: string | null;
  note: string | null;
};

/** package_templates row (tenant catalog). */
export type PackageTemplateRecord = {
  id: string;
  client_id: string;
  name: string;
  session_count: number;
  payment_plan: PackagePaymentPlan;
  price_total: number | null;
  price_per_session: number | null;
  validity_days: number | null;
  is_active: boolean;
};

/** Write DTO for a template (camelCase; mapped at the query boundary). */
export type PackageTemplatePayload = {
  name: string;
  sessionCount: number;
  paymentPlan: PackagePaymentPlan;
  priceTotal: number | null;
  pricePerSession: number | null;
  validityDays: number | null;
  isActive: boolean;
};

/** One installment of the schedule sent to sell_package; amount in integer paise. */
export type InstallmentInput = {
  dueOn: string;
  amountPaise: number;
};

/** Optional payment collected in the same transaction as the sale; amount in integer paise. */
export type InitialPaymentInput = {
  amountPaise: number;
  method: PackagePaymentMethod;
  note: string | null;
};

/** Write DTO for sell_package (camelCase; mapped to RPC parameters in package-queries). */
export type SellPackagePayload = {
  customerId: string;
  name: string;
  sessionsTotal: number;
  paymentPlan: PackagePaymentPlan;
  priceTotal: number | null;
  pricePerSession: number | null;
  validUntil: string | null;
  templateId: string | null;
  note: string | null;
  /** Required for the installments plan, null otherwise. */
  installments: InstallmentInput[] | null;
  /** Upfront and installments plans only. */
  initialPayment: InitialPaymentInput | null;
  /** Stable per modal submission: a retry of the same sale returns the stored package instead of selling twice. */
  idempotencyKey: string | null;
};

/** Write DTO for record_package_payment. */
export type RecordPaymentPayload = {
  packageId: string;
  kind: PackagePaymentKind;
  amountPaise: number;
  method: PackagePaymentMethod;
  /** Required for per_visit (the consumed session this payment settles), null otherwise. */
  sessionId: string | null;
  note: string | null;
  /** Stable per form submission so a retry never double charges. */
  idempotencyKey: string | null;
};

export type RecordPaymentResult = {
  paymentId: string;
  paidTotal: number;
  balance: number;
  replayed: boolean;
};

export type CancelPackageResult = {
  voidedSessions: number;
};

export type AttachPackageResult = {
  sessionId: string;
  status: PackageSessionStatus;
  remaining: number;
};

export type ResolveMissedResult = {
  sessionId: string;
  status: PackageSessionStatus;
  overrodeDefault: boolean;
  validityExtendedDays: number;
  validUntil: string | null;
  chargeOnForfeit: boolean | null;
};
