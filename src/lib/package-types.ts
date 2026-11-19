/**
 * Package and session domain types (Wave 3, D-05, D-06). Import-free and erasable TypeScript only, so the
 * assertion scripts and the pure ledger module can load it directly.
 *
 * Vocabulary is generic: a package is a bundle of N sessions sold to one customer. Tenants rename the words through
 * the client_settings packages namespace (labels), so the same screens serve clinics, salons, gyms and tutors.
 */

export const PACKAGE_PAYMENT_PLANS = ["upfront", "installments", "per_visit"] as const;
export type PackagePaymentPlan = (typeof PACKAGE_PAYMENT_PLANS)[number];

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
