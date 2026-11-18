export type StaffMemberRecord = {
  id: string;
  client_id: string;
  display_name: string;
  job_title: string | null;
  is_bookable: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type StaffMemberPayload = {
  displayName: string;
  jobTitle: string | null;
  isBookable: boolean;
};

/** Bounds mirror the CHECK constraints on public.staff_members. */
export const STAFF_MEMBER_LIMITS = {
  displayNameMax: 200,
  jobTitleMax: 200,
  /** A tenant's staff list is small; it is fetched once and capped here (the Staff tab shows a note when hit). */
  listMax: 200,
} as const;

/** Matches the unique index (client_id, lower(btrim(display_name))) and the appointments staffKey semantics. */
export function normalizeStaffName(value: string): string {
  return value.trim().toLowerCase();
}

/** Links legacy free-text staff_name values to a staff member by the same normalized-name key the database uses. */
export function findStaffMemberByName<T extends { id: string; display_name: string }>(
  staffMembers: T[],
  name: string | null | undefined,
): T | undefined {
  const key = normalizeStaffName(name ?? "");
  if (key === "") {
    return undefined;
  }

  return staffMembers.find((member) => normalizeStaffName(member.display_name) === key);
}
