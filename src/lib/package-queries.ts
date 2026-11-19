import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";
import { paiseToMoney } from "@/lib/package-ledger";
import {
  PACKAGE_LIMITS,
  isMissedResolution,
  isPackagePaymentKind,
  isPackagePaymentMethod,
  isPackagePaymentPlan,
  isPackageSessionStatus,
  isPackageStatus,
  type AttachPackageResult,
  type CancelPackageResult,
  type CustomerPackageRecord,
  type MissedReason,
  type MissedResolution,
  type PackageInstallmentRecord,
  type PackagePaymentRecord,
  type PackageSessionRecord,
  type PackageStatus,
  type PackageTemplatePayload,
  type PackageTemplateRecord,
  type PendingDecisionRecord,
  type RecordPaymentPayload,
  type RecordPaymentResult,
  type ResolveMissedResult,
  type SellPackagePayload,
} from "@/lib/package-types";

const PACKAGE_SELECT =
  "id, client_id, customer_id, template_id, name_snapshot, sessions_total, payment_plan, price_total, price_per_session, valid_until, status, note, completed_at, cancelled_at, created_at, customer:customers(name, phone)";

const SESSION_SELECT =
  "id, client_id, package_id, appointment_id, status, missed_reason, resolution, resolution_overrode_default, validity_extended_days, charge_on_forfeit, note, completed_at, missed_at, resolved_at, voided_at, created_at, appointment:appointments(date, start_time, status, name, service)";

const INSTALLMENT_SELECT = "id, package_id, seq, due_on, amount";

const PAYMENT_SELECT = "id, package_id, kind, amount, method, paid_at, session_id, note";

const TEMPLATE_SELECT =
  "id, client_id, name, session_count, payment_plan, price_total, price_per_session, validity_days, is_active";

const SESSION_ID_CHUNK = 50;

function getClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }

  return supabase;
}

function raiseQueryError(error: unknown, fallback: string): never {
  throw new Error(formatSupabaseError(error, fallback));
}

/** RPC failures mapped by SQLSTATE (contract documented in 20261120_packages_rpcs.sql). */
export function mapPackageRpcError(error: unknown, fallback: string): string {
  const record = error != null && typeof error === "object" ? (error as Record<string, unknown>) : {};
  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";

  if (code === "42501") {
    return "You do not have access to this package.";
  }
  if (code === "P0002") {
    if (message.includes("Customer")) return "Customer not found. Pick the customer again.";
    if (message.includes("Appointment")) return "Appointment not found. It may have been deleted.";
    if (message.includes("Session")) return "This session no longer exists. Reload and try again.";
    if (message.includes("Template")) return "That template is no longer available.";
    return "Package not found. Reload and try again.";
  }
  if (code === "23505") {
    if (message.includes("Idempotency")) return "This payment was already recorded with different details. Reload and check the payments list.";
    if (message.includes("package_templates") || message.includes("package_templates_client_name_uniq")) {
      return "A template with this name already exists.";
    }
    return "This appointment is already linked to a package.";
  }
  if (code === "23514") {
    if (message.includes("exceeds")) return "That amount is more than the balance.";
    if (message.includes("payment")) return "This visit has a recorded package payment, so its status cannot change.";
    return "No sessions left on this package.";
  }
  if (code === "22023") {
    if (message.includes("expired")) return "The package has expired for this appointment date.";
    if (message.includes("not active")) return "This package is no longer active.";
    if (message.includes("cancelled appointment")) return "A cancelled appointment cannot use a package.";
    if (message.includes("Invalid installments")) {
      return "Check the installment schedule: amounts must add up to the price and dates must be in order.";
    }
    if (message.includes("Invalid initial payment")) return "Check the first payment: amount, method and notes.";
    if (message.includes("Invalid amount")) return "Enter a valid amount (up to two decimals).";
    if (message.includes("Invalid method")) return "Choose how the payment was made.";
    if (message.includes("Invalid payment kind") || message.includes("does not match the plan")) {
      return "This payment type does not match the payment plan.";
    }
    if (message.includes("not chargeable")) {
      return "That visit is not owed (not used yet, rolled over, or forfeits are not charged).";
    }
    if (message.includes("Session is required")) return "Choose which visit this payment is for.";
    if (message.includes("Session not allowed")) return "This plan does not take payments against a visit.";
    if (message.includes("is cancelled")) return "This package is cancelled and no longer takes payments.";
    if (message.includes("already cancelled")) return "This package is already cancelled.";
    if (message.includes("cannot be cancelled")) return "A completed package cannot be cancelled.";
    if (message.includes("Invalid idempotency")) return "The payment could not be sent. Reload and try again.";
    if (message.includes("Invalid payment plan")) return "Choose a payment plan.";
    if (message.includes("awaiting a decision")) return "This session already has a decision.";
    if (message.includes("marked missed")) return "Only booked sessions can be marked missed.";
    if (message.includes("Only scheduled")) return "Only scheduled or undecided sessions can be removed.";
    if (message.includes("Invalid price")) return "Enter a valid price (up to two decimals; per visit needs a price above zero).";
    if (message.includes("Invalid validity")) return "Enter a valid expiry.";
    if (message.includes("Invalid session count")) return `Sessions must be from 1 to ${PACKAGE_LIMITS.sessionsMax}.`;
    if (message.includes("Invalid name")) return `Name is required (up to ${PACKAGE_LIMITS.nameMax} characters).`;
    if (message.includes("Invalid note")) return `Notes must be ${PACKAGE_LIMITS.noteMax} characters or fewer.`;
    if (message.includes("Invalid resolution")) return "Choose roll over or forfeit.";
    return "Some details are not valid. Check and try again.";
  }

  return formatSupabaseError(error, fallback);
}

function asNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asNullableText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** PostgREST embeds a to-one relation as an object (or occasionally a one-element array). */
function embedded(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    return value.length > 0 && typeof value[0] === "object" && value[0] !== null
      ? (value[0] as Record<string, unknown>)
      : null;
  }
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function mapPackage(row: Record<string, unknown>): CustomerPackageRecord {
  const customer = embedded(row.customer);
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    customer_id: String(row.customer_id),
    template_id: asNullableText(row.template_id),
    name_snapshot: String(row.name_snapshot ?? ""),
    sessions_total: asNumber(row.sessions_total),
    payment_plan: isPackagePaymentPlan(row.payment_plan) ? row.payment_plan : "upfront",
    price_total: asNullableNumber(row.price_total),
    price_per_session: asNullableNumber(row.price_per_session),
    valid_until: asNullableText(row.valid_until),
    status: isPackageStatus(row.status) ? row.status : "active",
    note: asNullableText(row.note),
    completed_at: asNullableText(row.completed_at),
    cancelled_at: asNullableText(row.cancelled_at),
    created_at: String(row.created_at ?? ""),
    customerName: asNullableText(customer?.name),
    customerPhone: asNullableText(customer?.phone),
  };
}

function mapSession(row: Record<string, unknown>): PackageSessionRecord {
  const appointment = embedded(row.appointment);
  const missedReason = row.missed_reason;
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    package_id: String(row.package_id),
    appointment_id: asNullableText(row.appointment_id),
    status: isPackageSessionStatus(row.status) ? row.status : "voided",
    missed_reason: missedReason === "cancelled" || missedReason === "no_show" ? (missedReason as MissedReason) : null,
    resolution: isMissedResolution(row.resolution) ? row.resolution : null,
    resolution_overrode_default: row.resolution_overrode_default === true,
    validity_extended_days: asNumber(row.validity_extended_days),
    charge_on_forfeit: typeof row.charge_on_forfeit === "boolean" ? row.charge_on_forfeit : null,
    note: asNullableText(row.note),
    completed_at: asNullableText(row.completed_at),
    missed_at: asNullableText(row.missed_at),
    resolved_at: asNullableText(row.resolved_at),
    voided_at: asNullableText(row.voided_at),
    created_at: String(row.created_at ?? ""),
    appointmentDate: asNullableText(appointment?.date),
    appointmentStartTime: asNullableText(appointment?.start_time),
    appointmentStatus: asNullableText(appointment?.status),
    appointmentName: asNullableText(appointment?.name),
    appointmentService: asNullableText(appointment?.service),
  };
}

export type PackageWithSessions = CustomerPackageRecord & { sessions: PackageSessionRecord[] };

/** Sessions for many packages in one tenant-scoped read; voided rows are included (history). */
async function fetchSessionsForPackages(clientId: string, packageIds: string[]): Promise<PackageSessionRecord[]> {
  if (packageIds.length === 0) {
    return [];
  }

  const supabase = getClient();
  const sessions: PackageSessionRecord[] = [];
  // Chunked so the id list never makes the request URL too long (up to PACKAGE_LIMITS.listMax packages).
  for (let index = 0; index < packageIds.length; index += SESSION_ID_CHUNK) {
    const { data, error } = await supabase
      .from("package_sessions")
      .select(SESSION_SELECT)
      .eq("client_id", clientId)
      .in("package_id", packageIds.slice(index, index + SESSION_ID_CHUNK))
      .order("created_at", { ascending: true });

    if (error) {
      raiseQueryError(error, "Unable to load package sessions.");
    }

    sessions.push(...((data ?? []) as Array<Record<string, unknown>>).map(mapSession));
  }

  return sessions;
}

function attachSessions(packages: CustomerPackageRecord[], sessions: PackageSessionRecord[]): PackageWithSessions[] {
  const byPackage = new Map<string, PackageSessionRecord[]>();
  for (const session of sessions) {
    const list = byPackage.get(session.package_id) ?? [];
    list.push(session);
    byPackage.set(session.package_id, list);
  }
  return packages.map((pkg) => ({ ...pkg, sessions: byPackage.get(pkg.id) ?? [] }));
}

/** Newest first, capped at PACKAGE_LIMITS.listMax, with every package's sessions for credit math. */
export async function fetchCustomerPackages(
  clientId: string,
  options?: { statuses?: PackageStatus[]; customerId?: string },
): Promise<PackageWithSessions[]> {
  const supabase = getClient();
  let query = supabase.from("customer_packages").select(PACKAGE_SELECT).eq("client_id", clientId);

  if (options?.statuses && options.statuses.length > 0) {
    query = query.in("status", options.statuses);
  }
  if (options?.customerId) {
    query = query.eq("customer_id", options.customerId);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .range(0, PACKAGE_LIMITS.listMax - 1);

  if (error) {
    raiseQueryError(error, "Unable to load packages.");
  }

  const packages = ((data ?? []) as Array<Record<string, unknown>>).map(mapPackage);
  const sessions = await fetchSessionsForPackages(
    clientId,
    packages.map((pkg) => pkg.id),
  );
  return attachSessions(packages, sessions);
}

export type PackageDetailRecord = PackageWithSessions & {
  installments: PackageInstallmentRecord[];
  payments: PackagePaymentRecord[];
};

function mapInstallment(row: Record<string, unknown>): PackageInstallmentRecord {
  return {
    id: String(row.id),
    package_id: String(row.package_id),
    seq: asNumber(row.seq),
    due_on: String(row.due_on ?? ""),
    amount: asNumber(row.amount),
  };
}

function mapPayment(row: Record<string, unknown>): PackagePaymentRecord {
  return {
    id: String(row.id),
    package_id: String(row.package_id),
    kind: isPackagePaymentKind(row.kind) ? row.kind : "upfront",
    amount: asNumber(row.amount),
    method: isPackagePaymentMethod(row.method) ? row.method : "OTHER",
    paid_at: String(row.paid_at ?? ""),
    session_id: asNullableText(row.session_id),
    note: asNullableText(row.note),
  };
}

function mapTemplate(row: Record<string, unknown>): PackageTemplateRecord {
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    name: String(row.name ?? ""),
    session_count: asNumber(row.session_count),
    payment_plan: isPackagePaymentPlan(row.payment_plan) ? row.payment_plan : "upfront",
    price_total: asNullableNumber(row.price_total),
    price_per_session: asNullableNumber(row.price_per_session),
    validity_days: asNullableNumber(row.validity_days),
    is_active: row.is_active !== false,
  };
}

/** Schedule and payments of one package (tenant-scoped reads; a package has at most 120 installments). */
async function fetchMoneyForPackage(
  clientId: string,
  packageId: string,
): Promise<{ installments: PackageInstallmentRecord[]; payments: PackagePaymentRecord[] }> {
  const supabase = getClient();
  const [installmentResult, paymentResult] = await Promise.all([
    supabase
      .from("package_installments")
      .select(INSTALLMENT_SELECT)
      .eq("client_id", clientId)
      .eq("package_id", packageId)
      .order("seq", { ascending: true }),
    supabase
      .from("package_payments")
      .select(PAYMENT_SELECT)
      .eq("client_id", clientId)
      .eq("package_id", packageId)
      .order("paid_at", { ascending: false })
      .order("created_at", { ascending: false })
      .range(0, 499),
  ]);

  if (installmentResult.error) {
    raiseQueryError(installmentResult.error, "Unable to load the installment schedule.");
  }
  if (paymentResult.error) {
    raiseQueryError(paymentResult.error, "Unable to load payments.");
  }

  return {
    installments: ((installmentResult.data ?? []) as Array<Record<string, unknown>>).map(mapInstallment),
    payments: ((paymentResult.data ?? []) as Array<Record<string, unknown>>).map(mapPayment),
  };
}

/** One package with all of its sessions, installments and payments (detail drawer). */
export async function fetchPackageDetail(clientId: string, packageId: string): Promise<PackageDetailRecord | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("customer_packages")
    .select(PACKAGE_SELECT)
    .eq("client_id", clientId)
    .eq("id", packageId)
    .maybeSingle();

  if (error) {
    raiseQueryError(error, "Unable to load the package.");
  }
  if (!data) {
    return null;
  }

  const pkg = mapPackage(data as Record<string, unknown>);
  const [sessions, money] = await Promise.all([
    fetchSessionsForPackages(clientId, [pkg.id]),
    fetchMoneyForPackage(clientId, pkg.id),
  ]);
  return { ...pkg, sessions, ...money };
}

/** The live (non-voided) package link of one appointment, with its package, or null. */
export async function fetchAppointmentPackageLink(
  clientId: string,
  appointmentId: string,
): Promise<{ session: PackageSessionRecord; pkg: PackageWithSessions } | null> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("package_sessions")
    .select("id, package_id")
    .eq("client_id", clientId)
    .eq("appointment_id", appointmentId)
    .neq("status", "voided")
    .limit(1)
    .maybeSingle();

  if (error) {
    raiseQueryError(error, "Unable to load the appointment's package.");
  }
  if (!data) {
    return null;
  }

  const link = data as { id: string; package_id: string };
  const pkg = await fetchPackageDetail(clientId, String(link.package_id));
  const session = pkg?.sessions.find((item) => item.id === String(link.id));
  return pkg && session ? { session, pkg } : null;
}

/** Appointments of the tenant matching a phone (last 10 digits), not deleted, for linking older visits. */
export async function fetchLinkableAppointments(
  clientId: string,
  phone: string | null,
): Promise<Array<{ id: string; date: string | null; start_time: string | null; status: string | null; service: string | null }>> {
  const digits = (phone ?? "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) {
    return [];
  }

  const supabase = getClient();
  const { data, error } = await supabase
    .from("appointments")
    .select("id, date, start_time, status, service")
    .eq("client_id", clientId)
    .eq("phone", digits)
    .is("deleted_at", null)
    .neq("status", "cancelled")
    .order("date", { ascending: false })
    .range(0, 49);

  if (error) {
    raiseQueryError(error, "Unable to load appointments.");
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    date: asNullableText(row.date),
    start_time: asNullableText(row.start_time),
    status: asNullableText(row.status),
    service: asNullableText(row.service),
  }));
}

/** Sells a package through the definer RPC; the tenant is re-derived from the session inside the function. */
export async function sellPackage(clientId: string, payload: SellPackagePayload): Promise<string> {
  const supabase = getClient();
  const { data, error } = await supabase.rpc("sell_package", {
    p_client_id: clientId,
    p_customer_id: payload.customerId,
    p_name: payload.name.trim(),
    p_sessions_total: payload.sessionsTotal,
    p_payment_plan: payload.paymentPlan,
    p_price_total: payload.priceTotal,
    p_price_per_session: payload.pricePerSession,
    p_valid_until: payload.validUntil,
    p_template_id: payload.templateId,
    // Amounts travel as exact two-decimal numbers derived from integer paise; the RPC re-validates every rule.
    p_installments:
      payload.paymentPlan === "installments" && payload.installments
        ? payload.installments.map((item) => ({ due_on: item.dueOn, amount: paiseToMoney(item.amountPaise) }))
        : null,
    p_initial_payment: payload.initialPayment
      ? {
          amount: paiseToMoney(payload.initialPayment.amountPaise),
          method: payload.initialPayment.method,
          note: payload.initialPayment.note?.trim() || null,
        }
      : null,
    p_note: payload.note?.trim() || null,
  });

  if (error) {
    throw new Error(mapPackageRpcError(error, "Unable to sell the package."));
  }

  const packageId = asNullableText(embedded(data)?.package_id);
  if (!packageId) {
    throw new Error("The package was not created.");
  }
  return packageId;
}

export async function attachPackageSession(
  clientId: string,
  packageId: string,
  appointmentId: string,
): Promise<AttachPackageResult> {
  const supabase = getClient();
  const { data, error } = await supabase.rpc("attach_package_session", {
    p_client_id: clientId,
    p_package_id: packageId,
    p_appointment_id: appointmentId,
  });

  if (error) {
    throw new Error(mapPackageRpcError(error, "Unable to link the package."));
  }

  const result = embedded(data);
  const sessionId = asNullableText(result?.session_id);
  if (!result || !sessionId) {
    throw new Error("The package was not linked.");
  }
  return {
    sessionId,
    status: isPackageSessionStatus(result.status) ? result.status : "scheduled",
    remaining: asNumber(result.remaining),
  };
}

/** Undecided (missed_pending) sessions of the tenant, oldest first, with package and customer names. */
export async function fetchPendingDecisions(clientId: string): Promise<PendingDecisionRecord[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("package_sessions")
    .select(SESSION_SELECT)
    .eq("client_id", clientId)
    .eq("status", "missed_pending")
    .order("missed_at", { ascending: true })
    .range(0, PACKAGE_LIMITS.listMax - 1);

  if (error) {
    raiseQueryError(error, "Unable to load sessions that need a decision.");
  }

  const sessions = ((data ?? []) as Array<Record<string, unknown>>).map(mapSession);
  const packageIds = Array.from(new Set(sessions.map((session) => session.package_id)));
  const packagesById = new Map<string, CustomerPackageRecord>();

  for (let index = 0; index < packageIds.length; index += SESSION_ID_CHUNK) {
    const { data: packageRows, error: packageError } = await supabase
      .from("customer_packages")
      .select(PACKAGE_SELECT)
      .eq("client_id", clientId)
      .in("id", packageIds.slice(index, index + SESSION_ID_CHUNK));

    if (packageError) {
      raiseQueryError(packageError, "Unable to load sessions that need a decision.");
    }

    for (const row of (packageRows ?? []) as Array<Record<string, unknown>>) {
      const pkg = mapPackage(row);
      packagesById.set(pkg.id, pkg);
    }
  }

  return sessions.map((session) => {
    const pkg = packagesById.get(session.package_id);
    return { ...session, packageName: pkg?.name_snapshot ?? "", customerName: pkg?.customerName ?? null };
  });
}

export async function markSessionMissed(clientId: string, sessionId: string, note?: string | null): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.rpc("mark_session_missed", {
    p_client_id: clientId,
    p_session_id: sessionId,
    p_note: note?.trim() || null,
  });

  if (error) {
    throw new Error(mapPackageRpcError(error, "Unable to mark the session missed."));
  }
}

/** Records the doctor's decision; the overrode-default flag and the R-15/R-16 snapshots are computed server-side. */
export async function resolveMissedSession(
  clientId: string,
  sessionId: string,
  resolution: MissedResolution,
  note?: string | null,
): Promise<ResolveMissedResult> {
  const supabase = getClient();
  const { data, error } = await supabase.rpc("resolve_missed_session", {
    p_client_id: clientId,
    p_session_id: sessionId,
    p_resolution: resolution,
    p_note: note?.trim() || null,
  });

  if (error) {
    throw new Error(mapPackageRpcError(error, "Unable to save the decision."));
  }

  const result = embedded(data);
  return {
    sessionId,
    status: isPackageSessionStatus(result?.status) ? result.status : resolution === "rollover" ? "rolled_over" : "forfeited",
    overrodeDefault: result?.overrode_default === true,
    validityExtendedDays: asNumber(result?.validity_extended_days),
    validUntil: asNullableText(result?.valid_until),
    chargeOnForfeit: typeof result?.charge_on_forfeit === "boolean" ? result.charge_on_forfeit : null,
  };
}

export async function detachPackageSession(clientId: string, sessionId: string, note?: string | null): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.rpc("detach_package_session", {
    p_client_id: clientId,
    p_session_id: sessionId,
    p_note: note?.trim() || null,
  });

  if (error) {
    throw new Error(mapPackageRpcError(error, "Unable to remove the package link."));
  }
}

/** Appends one payment through the definer RPC; a repeated idempotency key returns the existing row (replayed). */
export async function recordPackagePayment(clientId: string, payload: RecordPaymentPayload): Promise<RecordPaymentResult> {
  const supabase = getClient();
  const { data, error } = await supabase.rpc("record_package_payment", {
    p_client_id: clientId,
    p_package_id: payload.packageId,
    p_kind: payload.kind,
    p_amount: paiseToMoney(payload.amountPaise),
    p_method: payload.method,
    p_session_id: payload.sessionId,
    p_note: payload.note?.trim() || null,
    p_idempotency_key: payload.idempotencyKey,
  });

  if (error) {
    throw new Error(mapPackageRpcError(error, "Unable to record the payment."));
  }

  const result = embedded(data);
  const paymentId = asNullableText(result?.payment_id);
  if (!result || !paymentId) {
    throw new Error("The payment was not recorded.");
  }
  return {
    paymentId,
    paidTotal: asNumber(result.paid_total),
    balance: asNumber(result.balance),
    replayed: result.replayed === true,
  };
}

/** Cancels a package: open sessions are voided, payments and consumed sessions stay. */
export async function cancelPackage(clientId: string, packageId: string, reason?: string | null): Promise<CancelPackageResult> {
  const supabase = getClient();
  const { data, error } = await supabase.rpc("cancel_package", {
    p_client_id: clientId,
    p_package_id: packageId,
    p_reason: reason?.trim() || null,
  });

  if (error) {
    throw new Error(mapPackageRpcError(error, "Unable to cancel the package."));
  }

  return { voidedSessions: asNumber(embedded(data)?.voided_sessions) };
}

// ---------------------------------------------------------------------------
// Templates: tenant catalog, browser CRUD under own-client RLS (no money ledger).
// ---------------------------------------------------------------------------

export async function fetchPackageTemplates(
  clientId: string,
  options?: { includeInactive?: boolean },
): Promise<PackageTemplateRecord[]> {
  const supabase = getClient();
  let query = supabase.from("package_templates").select(TEMPLATE_SELECT).eq("client_id", clientId);
  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query.order("name", { ascending: true }).range(0, PACKAGE_LIMITS.listMax - 1);
  if (error) {
    raiseQueryError(error, "Unable to load templates.");
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map(mapTemplate);
}

function templateRow(payload: PackageTemplatePayload) {
  const perVisit = payload.paymentPlan === "per_visit";
  return {
    name: payload.name.trim(),
    session_count: payload.sessionCount,
    payment_plan: payload.paymentPlan,
    price_total: perVisit ? null : payload.priceTotal,
    price_per_session: perVisit ? payload.pricePerSession : null,
    validity_days: payload.validityDays,
    is_active: payload.isActive,
  };
}

export async function createPackageTemplate(clientId: string, payload: PackageTemplatePayload): Promise<PackageTemplateRecord> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("package_templates")
    .insert({ client_id: clientId, ...templateRow(payload) })
    .select(TEMPLATE_SELECT)
    .single();

  if (error) {
    throw new Error(mapPackageRpcError(error, "Unable to save the template."));
  }
  return mapTemplate(data as Record<string, unknown>);
}

export async function updatePackageTemplate(
  clientId: string,
  templateId: string,
  payload: PackageTemplatePayload,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("package_templates")
    .update(templateRow(payload))
    .eq("client_id", clientId)
    .eq("id", templateId);

  if (error) {
    throw new Error(mapPackageRpcError(error, "Unable to save the template."));
  }
}

/** Deleting a template keeps sold packages (the link is cleared by the foreign key). */
export async function deletePackageTemplate(clientId: string, templateId: string): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase.from("package_templates").delete().eq("client_id", clientId).eq("id", templateId);

  if (error) {
    throw new Error(mapPackageRpcError(error, "Unable to delete the template."));
  }
}
