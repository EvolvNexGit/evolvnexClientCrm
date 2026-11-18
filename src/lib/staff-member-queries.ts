import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";
import {
  STAFF_MEMBER_LIMITS,
  type StaffMemberPayload,
  type StaffMemberRecord,
} from "@/lib/staff-member-types";

const STAFF_MEMBER_SELECT =
  "id, client_id, display_name, job_title, is_bookable, is_active, created_at, updated_at";

const DUPLICATE_NAME_MESSAGE = "A staff member with this name already exists.";

function getClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }

  return supabase;
}

function raiseQueryError(error: unknown, fallback: string): never {
  if (error && typeof error === "object" && (error as { code?: unknown }).code === "23505") {
    throw new Error(DUPLICATE_NAME_MESSAGE);
  }

  throw new Error(formatSupabaseError(error, fallback));
}

function mapStaffMember(row: Record<string, unknown>): StaffMemberRecord {
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    display_name: String(row.display_name ?? ""),
    job_title: typeof row.job_title === "string" ? row.job_title : null,
    is_bookable: row.is_bookable === true,
    is_active: row.is_active === true,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/** Trims and validates the write fields; mirrors the table CHECK constraints so failures read clearly. */
function normalizePayload(payload: StaffMemberPayload) {
  const displayName = payload.displayName.trim();
  if (displayName.length === 0) {
    throw new Error("Staff name is required.");
  }
  if (displayName.length > STAFF_MEMBER_LIMITS.displayNameMax) {
    throw new Error(`Staff name must be ${STAFF_MEMBER_LIMITS.displayNameMax} characters or fewer.`);
  }

  const jobTitle = payload.jobTitle?.trim() || null;
  if (jobTitle !== null && jobTitle.length > STAFF_MEMBER_LIMITS.jobTitleMax) {
    throw new Error(`Job title must be ${STAFF_MEMBER_LIMITS.jobTitleMax} characters or fewer.`);
  }

  return { display_name: displayName, job_title: jobTitle, is_bookable: payload.isBookable === true };
}

/** Active staff only by default; bookableOnly feeds appointment pickers. Capped at STAFF_MEMBER_LIMITS.listMax rows. */
export async function fetchStaffMembers(
  clientId: string,
  options?: { bookableOnly?: boolean; includeInactive?: boolean },
): Promise<StaffMemberRecord[]> {
  const supabase = getClient();
  let query = supabase.from("staff_members").select(STAFF_MEMBER_SELECT).eq("client_id", clientId);

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }
  if (options?.bookableOnly) {
    query = query.eq("is_bookable", true);
  }

  const { data, error } = await query
    .order("display_name", { ascending: true })
    .range(0, STAFF_MEMBER_LIMITS.listMax - 1);

  if (error) {
    raiseQueryError(error, "Unable to load staff members.");
  }

  return ((data ?? []) as Array<Record<string, unknown>>).map(mapStaffMember);
}

/** client_id is written after the payload fields so nothing can override the tenant. */
export async function createStaffMember(
  clientId: string,
  payload: StaffMemberPayload,
): Promise<StaffMemberRecord> {
  const supabase = getClient();
  const row = { ...normalizePayload(payload), client_id: clientId };

  const { data, error } = await supabase.from("staff_members").insert(row).select(STAFF_MEMBER_SELECT).single();

  if (error) {
    raiseQueryError(error, "Unable to add staff member.");
  }

  return mapStaffMember(data as Record<string, unknown>);
}

/** Filters by client_id AND id; zero matched rows (stale or foreign id) fails loudly. */
export async function updateStaffMember(
  clientId: string,
  staffMemberId: string,
  payload: StaffMemberPayload,
): Promise<StaffMemberRecord> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("staff_members")
    .update(normalizePayload(payload))
    .eq("client_id", clientId)
    .eq("id", staffMemberId)
    .select(STAFF_MEMBER_SELECT);

  if (error) {
    raiseQueryError(error, "Unable to update staff member.");
  }

  if (!data || data.length === 0) {
    throw new Error("Staff member not found.");
  }

  return mapStaffMember(data[0] as Record<string, unknown>);
}

/** Deactivate or reactivate; staff are never deleted because appointments reference them. */
export async function setStaffMemberActive(
  clientId: string,
  staffMemberId: string,
  isActive: boolean,
): Promise<void> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("staff_members")
    .update({ is_active: isActive })
    .eq("client_id", clientId)
    .eq("id", staffMemberId)
    .select("id");

  if (error) {
    raiseQueryError(error, "Unable to update staff member.");
  }

  if (!data || data.length === 0) {
    throw new Error("Staff member not found.");
  }
}
