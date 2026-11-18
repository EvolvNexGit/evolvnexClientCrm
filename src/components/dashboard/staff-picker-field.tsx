"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { formatSupabaseError } from "@/lib/supabase";
import { normalizeStaffName, type StaffMemberPayload, type StaffMemberRecord } from "@/lib/staff-member-types";

export type StaffPickerValue = {
  staffMemberId: string;
  staffName: string;
};

type StaffPickerFieldProps = {
  label?: string;
  value: StaffPickerValue;
  /** Active bookable staff members (already loaded by the parent through useStaffMembers). */
  staffMembers: StaffMemberRecord[];
  loading?: boolean;
  /** Quick-add: creates the staff member (bookable) and resolves with the saved record. */
  onCreate: (payload: StaffMemberPayload) => Promise<StaffMemberRecord>;
  onChange: (value: StaffPickerValue) => void;
};

const LEGACY_OPTION_VALUE = "__legacy__";
const ADD_OPTION_VALUE = "__add__";

/**
 * Staff dropdown for the appointment form: active bookable staff plus an inline "Add new staff".
 * Reports both the staff member id and its display name so the form can dual-write staff_member_id and the
 * legacy staff_name text. A legacy free-text name that matches no staff member stays selectable until changed.
 */
export function StaffPickerField({
  label = "Staff",
  value,
  staffMembers,
  loading = false,
  onCreate,
  onChange,
}: StaffPickerFieldProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const selectedMember = value.staffMemberId
    ? staffMembers.find((member) => member.id === value.staffMemberId)
    : undefined;
  // A selected id whose staff member is not in the bookable list (for example deactivated since) is shown by name.
  const hasUnlistedValue = value.staffName.trim() !== "" && !selectedMember;
  const selectValue = selectedMember ? selectedMember.id : hasUnlistedValue ? LEGACY_OPTION_VALUE : "";

  function handleSelect(next: string) {
    if (next === ADD_OPTION_VALUE) {
      setAdding(true);
      setAddError(null);
      return;
    }

    if (next === LEGACY_OPTION_VALUE) {
      return;
    }

    if (next === "") {
      onChange({ staffMemberId: "", staffName: "" });
      return;
    }

    const member = staffMembers.find((item) => item.id === next);
    if (member) {
      onChange({ staffMemberId: member.id, staffName: member.display_name });
    }
  }

  async function handleAdd() {
    const name = newName.trim();
    if (!name || creating) {
      return;
    }

    // Same normalized name already listed: select it instead of tripping the unique index.
    const existing = staffMembers.find((member) => normalizeStaffName(member.display_name) === normalizeStaffName(name));
    if (existing) {
      onChange({ staffMemberId: existing.id, staffName: existing.display_name });
      setAdding(false);
      setNewName("");
      return;
    }

    try {
      setCreating(true);
      setAddError(null);
      const created = await onCreate({ displayName: name, jobTitle: null, isBookable: true });
      onChange({ staffMemberId: created.id, staffName: created.display_name });
      setAdding(false);
      setNewName("");
    } catch (createError) {
      setAddError(formatSupabaseError(createError, "Unable to add staff member."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      <label className="block space-y-1">
        <span>{label}</span>
        <select
          value={selectValue}
          onChange={(event) => handleSelect(event.target.value)}
          disabled={loading}
          className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:text-sm"
        >
          <option value="">{loading ? "Loading staff..." : "Unassigned"}</option>
          {hasUnlistedValue && <option value={LEGACY_OPTION_VALUE}>{value.staffName.trim()} (not in staff list)</option>}
          {staffMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.display_name}
              {member.job_title ? ` (${member.job_title})` : ""}
            </option>
          ))}
          <option value={ADD_OPTION_VALUE}>+ Add new staff</option>
        </select>
      </label>

      {adding && (
        <div className="space-y-2 rounded-xl border border-border bg-background p-3">
          <label className="block space-y-1">
            <span>New staff name *</span>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleAdd();
                }
              }}
              maxLength={200}
              placeholder="Name"
              autoFocus
              className="w-full min-h-11 rounded-xl border border-border bg-card px-3 py-2 text-base text-text placeholder:text-muted-foreground sm:text-sm"
            />
          </label>
          {addError && <p className="text-sm text-rose-400">{addError}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={creating || newName.trim() === ""}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {creating ? "Adding..." : "Add and select"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setNewName("");
                setAddError(null);
              }}
              className="min-h-11 rounded-xl border border-border bg-background px-3 text-sm text-text hover:bg-muted"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
