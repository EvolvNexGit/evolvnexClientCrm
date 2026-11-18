"use client";

import { type FormEvent, useMemo, useState } from "react";
import { Edit3, Plus, Search, UserCheck, UserX } from "lucide-react";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { useStaffMembers } from "@/hooks/use-staff-members";
import { STAFF_MEMBER_LIMITS, type StaffMemberRecord } from "@/lib/staff-member-types";
import { formatSupabaseError } from "@/lib/supabase";
import { cn } from "@/lib/utils";

type StaffFormState = {
  displayName: string;
  jobTitle: string;
  isBookable: boolean;
};

const EMPTY_FORM: StaffFormState = { displayName: "", jobTitle: "", isBookable: true };

function BookableSwitch({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-background shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

/** Tenant staff list: add, edit, deactivate (never delete) and mark bookable for appointment pickers. */
export default function StaffTab({ clientId }: { clientId: string }) {
  const staff = useStaffMembers(clientId, { includeInactive: true, enabled: Boolean(clientId) });
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMemberRecord | null>(null);
  const [form, setForm] = useState<StaffFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const visibleStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    return staff.staffMembers.filter((member) => {
      if (!showInactive && !member.is_active) {
        return false;
      }
      if (!query) {
        return true;
      }
      return `${member.display_name} ${member.job_title ?? ""}`.toLowerCase().includes(query);
    });
  }, [search, showInactive, staff.staffMembers]);

  const inactiveCount = staff.staffMembers.filter((member) => !member.is_active).length;
  const capReached = staff.staffMembers.length >= STAFF_MEMBER_LIMITS.listMax;

  function openAddModal() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(member: StaffMemberRecord) {
    setEditing(member);
    setForm({
      displayName: member.display_name,
      jobTitle: member.job_title ?? "",
      isBookable: member.is_bookable,
    });
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditing(null);
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (staff.saving) {
      return;
    }

    if (!form.displayName.trim()) {
      setFormError("Staff name is required.");
      return;
    }

    try {
      setFormError(null);
      const payload = {
        displayName: form.displayName,
        jobTitle: form.jobTitle.trim() || null,
        isBookable: form.isBookable,
      };
      if (editing) {
        await staff.update(editing.id, payload);
      } else {
        await staff.create(payload);
      }
      closeModal();
    } catch (saveError) {
      // Keeps the modal open so the user can fix a duplicate name; the message already reads clearly.
      setFormError(formatSupabaseError(saveError, "Unable to save staff member."));
    }
  }

  async function runRowAction(member: StaffMemberRecord, action: () => Promise<unknown>) {
    if (busyId) {
      return;
    }

    try {
      setBusyId(member.id);
      await action();
    } catch {
      // The hook already exposes the failure through staff.error.
    } finally {
      setBusyId(null);
    }
  }

  function toggleBookable(member: StaffMemberRecord) {
    void runRowAction(member, () =>
      staff.update(member.id, {
        displayName: member.display_name,
        jobTitle: member.job_title,
        isBookable: !member.is_bookable,
      }),
    );
  }

  function toggleActive(member: StaffMemberRecord) {
    void runRowAction(member, () => staff.setActive(member.id, !member.is_active));
  }

  const hasAny = staff.staffMembers.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-text">Staff</h2>
          <p className="text-sm text-muted-foreground">
            People you can book or assign. Bookable staff appear in the appointment form and calendar.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 xl:min-h-0 xl:py-2.5"
        >
          <Plus className="h-4 w-4" />
          Add staff
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 xl:min-h-0 xl:py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Filter by name or job title"
            aria-label="Filter staff"
            className="w-full bg-transparent text-base text-text outline-none placeholder:text-muted-foreground sm:text-sm"
          />
        </div>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground xl:min-h-0">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(event) => setShowInactive(event.target.checked)}
            className="h-4 w-4"
          />
          Show inactive{inactiveCount > 0 ? ` (${inactiveCount})` : ""}
        </label>
      </div>

      <DataState
        loading={staff.loading && !hasAny}
        error={staff.error}
        empty={!staff.loading && !staff.error && visibleStaff.length === 0}
        emptyLabel={
          hasAny
            ? "No staff match the current filter."
            : "No staff yet. Add your first staff member to use them in appointments."
        }
      />

      {capReached && (
        <p className="text-sm text-muted-foreground">
          Showing the first {STAFF_MEMBER_LIMITS.listMax} staff members; refine the filter or deactivate people who
          have left.
        </p>
      )}

      {visibleStaff.length > 0 && (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-border bg-card md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Job title</th>
                  <th className="px-4 py-3 font-medium">Bookable</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleStaff.map((member) => (
                  <tr key={member.id} className={cn("border-b border-border last:border-0", !member.is_active && "opacity-60")}>
                    <td className="px-4 py-3 text-text">{member.display_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{member.job_title ?? "-"}</td>
                    <td className="px-4 py-3">
                      <BookableSwitch
                        checked={member.is_bookable}
                        disabled={busyId === member.id || !member.is_active}
                        label={`Bookable: ${member.display_name}`}
                        onToggle={() => toggleBookable(member)}
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{member.is_active ? "Active" : "Inactive"}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(member)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-text hover:bg-muted"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(member)}
                          disabled={busyId === member.id}
                          className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-sm text-text hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {member.is_active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                          {member.is_active ? "Deactivate" : "Reactivate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {visibleStaff.map((member) => (
              <li
                key={member.id}
                className={cn("rounded-xl border border-border bg-card p-4", !member.is_active && "opacity-60")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-medium text-text">{member.display_name}</p>
                    <p className="truncate text-sm text-muted-foreground">{member.job_title ?? "No job title"}</p>
                    <p className="text-xs text-muted-foreground">{member.is_active ? "Active" : "Inactive"}</p>
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                    Bookable
                    <BookableSwitch
                      checked={member.is_bookable}
                      disabled={busyId === member.id || !member.is_active}
                      label={`Bookable: ${member.display_name}`}
                      onToggle={() => toggleBookable(member)}
                    />
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(member)}
                    className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-border text-sm text-text hover:bg-muted"
                  >
                    <Edit3 className="h-4 w-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(member)}
                    disabled={busyId === member.id}
                    className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-border text-sm text-text hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {member.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    {member.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <EntityModal open={modalOpen} title={editing ? "Edit staff member" : "Add staff member"} onClose={closeModal}>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <label className="block space-y-1 text-sm text-muted-foreground">
            <span>Name *</span>
            <input
              value={form.displayName}
              onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
              maxLength={STAFF_MEMBER_LIMITS.displayNameMax}
              placeholder="Full name"
              autoFocus
              className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text placeholder:text-muted-foreground sm:text-sm"
            />
          </label>

          <label className="block space-y-1 text-sm text-muted-foreground">
            <span>Job title</span>
            <input
              value={form.jobTitle}
              onChange={(event) => setForm((current) => ({ ...current, jobTitle: event.target.value }))}
              maxLength={STAFF_MEMBER_LIMITS.jobTitleMax}
              placeholder="Doctor, Stylist, Cashier"
              className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text placeholder:text-muted-foreground sm:text-sm"
            />
          </label>

          <label className="flex min-h-11 items-center gap-3 text-sm text-text">
            <input
              type="checkbox"
              checked={form.isBookable}
              onChange={(event) => setForm((current) => ({ ...current, isBookable: event.target.checked }))}
              className="h-4 w-4"
            />
            Bookable (shown in appointment staff pickers and calendar columns)
          </label>

          {editing && (
            <p className="text-sm text-muted-foreground">
              Status: {editing.is_active ? "Active" : "Inactive"}. Use Deactivate or Reactivate on the list to change it.
            </p>
          )}

          {formError && <p className="text-sm text-rose-400">{formError}</p>}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeModal}
              className="min-h-11 w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground hover:bg-muted sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={staff.saving}
              className="min-h-11 w-full rounded-xl border border-border bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {staff.saving ? "Saving..." : editing ? "Save changes" : "Add staff"}
            </button>
          </div>
        </form>
      </EntityModal>
    </div>
  );
}
