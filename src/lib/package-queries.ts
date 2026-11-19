import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";
import {
  PACKAGE_LIMITS,
  isMissedResolution,
  isPackagePaymentPlan,
  isPackageSessionStatus,
  isPackageStatus,
  type AttachPackageResult,
  type CustomerPackageRecord,
  type MissedReason,
  type PackageSessionRecord,
  type PackageStatus,
  type SellPackagePayload,
} from "@/lib/package-types";

const PACKAGE_SELECT =
  "id, client_id, customer_id, template_id, name_snapshot, sessions_total, payment_plan, price_total, price_per_session, valid_until, status, note, completed_at, cancelled_at, created_at, customer:customers(name, phone)";

const SESSION_SELECT =
  "id, client_id, package_id, appointment_id, status, missed_reason, resolution, resolution_overrode_default, validity_extended_days, charge_on_forfeit, note, completed_at, missed_at, resolved_at, voided_at, created_at, appointment:appointments(date, start_time, status, name, service)";

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
    return "This appointment is already linked to a package.";
  }
  if (code === "23514") {
    if (message.includes("payment")) return "This visit has a recorded package payment, so its status cannot change.";
    return "No sessions left on this package.";
  }
  if (code === "22023") {
    if (message.includes("expired")) return "The package has expired for this appointment date.";
    if (message.includes("not active")) return "This package is no longer active.";
    if (message.includes("cancelled appointment")) return "A cancelled appointment cannot use a package.";
    if (message.includes("not supported yet")) return "Only upfront packages can be sold right now.";
    if (message.includes("awaiting a decision")) return "This session already has a decision.";
    if (message.includes("Only scheduled")) return "Only scheduled or undecided sessions can be removed.";
    if (message.includes("Invalid price")) return "Enter a valid price.";
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

/** One package with all of its sessions (detail drawer). */
export async function fetchPackageDetail(clientId: string, packageId: string): Promise<PackageWithSessions | null> {
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
  const sessions = await fetchSessionsForPackages(clientId, [pkg.id]);
  return { ...pkg, sessions };
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
    p_installments: null,
    p_initial_payment: null,
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
