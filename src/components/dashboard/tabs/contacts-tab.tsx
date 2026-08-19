"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MoreVertical, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import { useCustomers } from "@/hooks/use-customers";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagedList } from "@/hooks/use-paged-list";
import { usePersistentState } from "@/hooks/use-persistent-state";
import {
  fetchContactAudience,
  fetchContactStats,
  fetchCustomersPage,
  importContactRows,
  type ContactCsvRow,
} from "@/lib/billing-queries";
import {
  CONTACT_SOURCE_OPTIONS,
  type ContactAudienceGroup,
  type ContactStats,
  type CustomerPayload,
  type CustomerRecord,
} from "@/lib/billing-types";
import { parseDbTimestamp } from "@/lib/time-utils";

type ContactsView = "all" | "lists" | "tags" | "segments";

type ContactFormState = {
  name: string;
  phone: string;
  tags: string;
  source: string;
  stage: string;
  notes: string;
};

const emptyForm: ContactFormState = {
  name: "",
  phone: "",
  tags: "",
  source: "",
  stage: "",
  notes: "",
};

function monthStartIso() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function formatLastActivity(value: string | null) {
  const date = parseDbTimestamp(value);
  if (!date) {
    return "-";
  }
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((item) => item.some((value) => value.trim()));
}

function rowsFromCsv(text: string): ContactCsvRow[] {
  const table = parseCsv(text);
  const header = (table[0] ?? []).map((value) => value.trim().toLowerCase());
  const nameIndex = header.findIndex((value) => value === "name");
  const phoneIndex = header.findIndex((value) => value === "phone");
  if (nameIndex < 0 || phoneIndex < 0) {
    throw new Error("CSV must include Name and Phone columns.");
  }

  const column = (aliases: string[]) => header.findIndex((value) => aliases.includes(value));
  const emailIndex = column(["email"]);
  const tagsIndex = column(["tags", "tag"]);
  const sourceIndex = column(["source"]);
  const stageIndex = column(["stage", "status", "outreach_status"]);
  const notesIndex = column(["notes", "note"]);

  return table.slice(1).map((item) => ({
    name: item[nameIndex] ?? "",
    phone: item[phoneIndex] ?? "",
    email: emailIndex >= 0 ? item[emailIndex] : "",
    tags: tagsIndex >= 0 ? (item[tagsIndex] ?? "").split(/[,;]/) : [],
    source: sourceIndex >= 0 ? item[sourceIndex] : "",
    stage: stageIndex >= 0 ? item[stageIndex] : "",
    notes: notesIndex >= 0 ? item[notesIndex] : "",
  }));
}

function toPayload(form: ContactFormState): CustomerPayload {
  return {
    name: form.name.trim(),
    phone: form.phone.trim(),
    contactTags: form.tags.split(/[,;]/).map((tag) => tag.trim()).filter(Boolean),
    contactSource: form.source.trim() || null,
    outreachStatus: form.stage.trim() || null,
    notes: form.notes.trim() || null,
  };
}

export default function ContactsTab({ clientId }: { clientId: string }) {
  const customerState = useCustomers(clientId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [view, setView] = usePersistentState<ContactsView>("contacts-view", "all");
  const [searchQuery, setSearchQuery] = usePersistentState("contacts-search", "");
  const [tagFilter, setTagFilter] = usePersistentState("contacts-tag-filter", "");
  const [sourceFilter, setSourceFilter] = usePersistentState("contacts-source-filter", "");
  const [segmentFilter, setSourceSegment] = usePersistentState("contacts-segment-filter", "");
  const [blockedFilter, setBlockedFilter] = usePersistentState<"all" | "active" | "blocked">(
    "contacts-blocked-filter",
    "all",
  );
  const [newThisMonth, setNewThisMonth] = usePersistentState("contacts-new-month", false);
  const [stats, setStats] = useState<ContactStats | null>(null);
  const [audience, setAudience] = useState<{
    tags: ContactAudienceGroup[];
    lists: ContactAudienceGroup[];
    segments: ContactAudienceGroup[];
  }>({ tags: [], lists: [], segments: [] });
  const [form, setForm] = useState<ContactFormState>(emptyForm);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const pagedContacts = usePagedList<CustomerRecord>({
    resetKey: `${clientId}|${debouncedSearch}|${tagFilter}|${sourceFilter}|${segmentFilter}|${blockedFilter}|${newThisMonth}`,
    enabled: Boolean(clientId),
    fetchPage: ({ limit, offset }) =>
      fetchCustomersPage(clientId, {
        limit,
        offset,
        search: debouncedSearch,
        tag: tagFilter || null,
        source: sourceFilter || null,
        segment: segmentFilter || null,
        blocked: blockedFilter === "all" ? null : blockedFilter === "blocked",
        createdFrom: newThisMonth ? monthStartIso() : null,
      }),
  });

  async function refreshMeta() {
    const [nextStats, nextAudience] = await Promise.all([
      fetchContactStats(clientId),
      fetchContactAudience(clientId),
    ]);
    setStats(nextStats);
    setAudience(nextAudience);
  }

  useEffect(() => {
    void refreshMeta().catch((error: unknown) => {
      setActionError(error instanceof Error ? error.message : "Unable to load contact stats.");
    });
  }, [clientId]);

  async function refreshAll() {
    await Promise.all([pagedContacts.refresh(), refreshMeta(), customerState.refresh()]);
  }

  function openAdd() {
    setForm(emptyForm);
    setEditing(null);
    setActionError(null);
    setIsAddOpen(true);
  }

  function openEdit(contact: CustomerRecord) {
    setEditing(contact);
    setIsAddOpen(false);
    setMenuId(null);
    setActionError(null);
    setForm({
      name: contact.name,
      phone: contact.phone ?? "",
      tags: contact.contact_tags.join(", "),
      source: contact.contact_source ?? "",
      stage: contact.outreach_status ?? "",
      notes: contact.notes ?? "",
    });
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    const payload = toPayload(form);
    if (!payload.name || !payload.phone) {
      setActionError("Name and phone are required.");
      return;
    }

    try {
      if (editing) {
        await customerState.editCustomer(editing.id, payload);
      } else {
        await customerState.addCustomer(payload);
      }
      setEditing(null);
      setIsAddOpen(false);
      setForm(emptyForm);
      await refreshAll();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to save contact.");
    }
  }

  async function toggleBlocked(contact: CustomerRecord) {
    setMenuId(null);
    try {
      await customerState.editCustomer(contact.id, { name: contact.name, isBlocked: !contact.is_blocked });
      await refreshAll();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update contact.");
    }
  }

  async function handleImport(file: File) {
    setActionError(null);
    setImporting(true);
    try {
      const text = await file.text();
      const rows = rowsFromCsv(text);
      if (rows.length === 0) {
        throw new Error("No contact rows found in the CSV.");
      }
      const result = await importContactRows(clientId, rows);
      setActionError(`Imported ${result.created} new and updated ${result.updated} existing contacts.`);
      await refreshAll();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to import CSV.");
    } finally {
      setImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  const hasRows = pagedContacts.items.length > 0;
  const groups = view === "tags" ? audience.tags : view === "lists" ? audience.lists : audience.segments;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-primary">LEADS</p>
            <h2 className="mt-2 text-2xl font-semibold text-text">Contacts</h2>
            <p className="mt-1 text-sm text-muted-foreground">Manage your WhatsApp contacts and audience.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImport(file);
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              disabled={importing || customerState.saving}
              onClick={() => fileInputRef.current?.click()}
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Import CSV
            </Button>
            <Button type="button" className="gap-2" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Add Contact
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Contacts"
          value={stats?.total ?? 0}
          active={blockedFilter === "all" && !newThisMonth && !tagFilter && !sourceFilter && !segmentFilter}
          onClick={() => {
            setBlockedFilter("all");
            setNewThisMonth(false);
            setTagFilter("");
            setSourceFilter("");
            setSourceSegment("");
            setView("all");
          }}
        />
        <StatCard
          label="Active"
          value={stats?.active ?? 0}
          active={blockedFilter === "active"}
          onClick={() => {
            setBlockedFilter("active");
            setNewThisMonth(false);
            setView("all");
          }}
        />
        <StatCard
          label="New This Month"
          value={stats?.newThisMonth ?? 0}
          active={newThisMonth}
          onClick={() => {
            setNewThisMonth(true);
            setBlockedFilter("all");
            setView("all");
          }}
        />
        <StatCard
          label="Blocked"
          value={stats?.blocked ?? 0}
          active={blockedFilter === "blocked"}
          onClick={() => {
            setBlockedFilter("blocked");
            setNewThisMonth(false);
            setView("all");
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "lists", "tags", "segments"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setView(item)}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${
              view === item
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-text"
            }`}
          >
            {item === "all" ? "All Contacts" : item[0].toUpperCase() + item.slice(1)}
          </button>
        ))}
      </div>

      {actionError && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          {actionError}
        </div>
      )}

      {view === "all" ? (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by name, phone, source, or stage"
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
          />

          {(tagFilter || sourceFilter || segmentFilter) && (
            <div className="flex flex-wrap gap-2 text-sm">
              {tagFilter && (
                <FilterChip label={`Tag: ${tagFilter}`} onClear={() => setTagFilter("")} />
              )}
              {sourceFilter && (
                <FilterChip label={`List: ${sourceFilter}`} onClear={() => setSourceFilter("")} />
              )}
              {segmentFilter && (
                <FilterChip label={`Segment: ${segmentFilter}`} onClear={() => setSourceSegment("")} />
              )}
            </div>
          )}

          <DataState
            loading={pagedContacts.loading && !hasRows}
            error={pagedContacts.error}
            empty={!pagedContacts.loading && !pagedContacts.error && !hasRows}
            emptyLabel={searchQuery ? "No contacts match your search." : "No contacts yet."}
          />

          {hasRows && !pagedContacts.error && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full divide-y divide-border text-base">
                <thead className="bg-muted text-left text-sm uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Name</th>
                    <th className="px-3 py-3">Phone</th>
                    <th className="px-3 py-3">Tags</th>
                    <th className="px-3 py-3">Last Activity</th>
                    <th className="px-3 py-3">Source</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {pagedContacts.items.map((contact) => (
                    <tr key={contact.id} className="hover:bg-muted/40">
                      <td className="px-3 py-3 text-text">
                        <div>{contact.name}</div>
                        {contact.is_blocked && (
                          <span className="text-xs text-primary">Blocked</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{contact.phone ?? "-"}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {contact.contact_tags.length === 0 ? (
                            <span className="text-muted-foreground">-</span>
                          ) : (
                            contact.contact_tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full border border-border px-2 py-0.5 text-xs text-text"
                              >
                                {tag}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">
                        {formatLastActivity(contact.last_activity_at)}
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{contact.contact_source || "-"}</td>
                      <td className="relative px-3 py-3">
                        <button
                          type="button"
                          className="rounded-md border border-border p-1.5 text-muted-foreground hover:text-text"
                          onClick={() => setMenuId((current) => (current === contact.id ? null : contact.id))}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </button>
                        {menuId === contact.id && (
                          <div className="absolute right-3 z-10 mt-1 w-36 rounded-xl border border-border bg-card p-1 shadow-sm">
                            <button
                              type="button"
                              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-muted"
                              onClick={() => openEdit(contact)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-muted"
                              onClick={() => void toggleBlocked(contact)}
                            >
                              {contact.is_blocked ? "Unblock" : "Block"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ListPaginationControls
            loadedCount={pagedContacts.items.length}
            totalCount={pagedContacts.totalCount}
            hasMore={pagedContacts.hasMore}
            loading={pagedContacts.loadingMore}
            onShowMore={() => void pagedContacts.showMore()}
            onShowAll={() => void pagedContacts.showAll()}
            itemLabel="contacts"
          />
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <DataState
            loading={false}
            error={null}
            empty={groups.length === 0}
            emptyLabel={
              view === "tags"
                ? "No tags yet. Add tags when you create a contact."
                : view === "lists"
                  ? "No lists yet. Set a source such as Campaign or Walk-in."
                  : "No segments yet. Set a stage such as Lead or Customer."
            }
          />
          {groups.length > 0 && (
            <div className="divide-y divide-border rounded-xl border border-border">
              {groups.map((group) => (
                <button
                  key={group.label}
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-muted/40"
                  onClick={() => {
                    if (view === "tags") {
                      setTagFilter(group.label);
                    } else if (view === "lists") {
                      setSourceFilter(group.label);
                    } else {
                      setSourceSegment(group.label);
                    }
                    setView("all");
                  }}
                >
                  <span className="font-medium text-text">{group.label}</span>
                  <span className="text-sm text-muted-foreground">{group.count}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <EntityModal
        open={isAddOpen || Boolean(editing)}
        title={editing ? "Edit Contact" : "Add Contact"}
        onClose={() => {
          setIsAddOpen(false);
          setEditing(null);
        }}
      >
        <form className="space-y-3" onSubmit={(event) => void submitForm(event)}>
          <label className="block text-base text-muted-foreground">
            <span className="mb-1 block">Name *</span>
            <input
              required
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            />
          </label>
          <label className="block text-base text-muted-foreground">
            <span className="mb-1 block">Phone *</span>
            <input
              required
              value={form.phone}
              onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
              placeholder="+91..."
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            />
          </label>
          <label className="block text-base text-muted-foreground">
            <span className="mb-1 block">Tags</span>
            <input
              value={form.tags}
              onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value }))}
              placeholder="Lead, VIP"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            />
          </label>
          <label className="block text-base text-muted-foreground">
            <span className="mb-1 block">Source</span>
            <input
              list="contact-source-options"
              value={form.source}
              onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}
              placeholder="Campaign, Walk-in, Website, Referral"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            />
            <datalist id="contact-source-options">
              {CONTACT_SOURCE_OPTIONS.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </label>
          <label className="block text-base text-muted-foreground">
            <span className="mb-1 block">Stage</span>
            <input
              value={form.stage}
              onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value }))}
              placeholder="Lead, Customer, VIP"
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            />
          </label>
          <label className="block text-base text-muted-foreground">
            <span className="mb-1 block">Notes</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
            />
          </label>
          <Button type="submit" className="w-full" disabled={customerState.saving}>
            {customerState.saving ? "Saving..." : editing ? "Save Changes" : "Create Contact"}
          </Button>
        </form>
      </EntityModal>
    </div>
  );
}

function StatCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border px-4 py-4 text-left ${
        active ? "border-primary bg-primary/10" : "border-border bg-card"
      }`}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-text">{value.toLocaleString("en-IN")}</p>
    </button>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className="rounded-full border border-border px-3 py-1 text-muted-foreground hover:text-text"
    >
      {label} ×
    </button>
  );
}
