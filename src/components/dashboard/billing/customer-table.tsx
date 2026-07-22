"use client";

import { ListPaginationControls } from "@/components/ui/list-pagination-controls";
import { Button } from "@/components/ui/button";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { usePersistentState } from "@/hooks/use-persistent-state";
import type { CustomerPayload, CustomerRecord } from "@/lib/billing-types";
import { formatUtcToIst } from "@/lib/time-utils";

function formatDateOnly(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

type CustomerTableProps = {
  customers: CustomerRecord[];
  loading: boolean;
  error: string | null;
  saving: boolean;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onAdd: (payload: CustomerPayload) => Promise<CustomerRecord>;
  onEdit: (customerId: string, payload: Partial<CustomerPayload>) => Promise<void>;
  onDelete: (customerId: string) => Promise<void>;
  pagination: {
    totalCount: number | null;
    hasMore: boolean;
    loadingMore: boolean;
    onShowMore: () => void;
    onShowAll: () => void;
  };
};

type CustomerFormState = {
  name: string;
  phone: string;
  email: string;
  dob: string;
};

const initialForm: CustomerFormState = {
  name: "",
  phone: "",
  email: "",
  dob: "",
};



function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount || 0);
}

export function CustomerTable({
  customers,
  loading,
  error,
  saving,
  searchQuery,
  onSearchChange,
  onAdd,
  onEdit,
  onDelete,
  pagination,
}: CustomerTableProps) {
  const [isAddOpen, setIsAddOpen] = usePersistentState("customer-table-is-add-open", false);
  const [editingCustomer, setEditingCustomer] = usePersistentState<CustomerRecord | null>(
    "customer-table-editing-customer",
    null,
  );
  const [form, setForm] = usePersistentState<CustomerFormState>("customer-table-form", initialForm);
  const [actionError, setActionError] = usePersistentState<string | null>("customer-table-action-error", null);
  const [pendingDeleteCustomer, setPendingDeleteCustomer] = usePersistentState<CustomerRecord | null>(
    "customer-table-pending-delete",
    null,
  );

  const hasRows = customers.length > 0;

  function downloadCsv(filename: string, rows: string[][]) {
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportCustomersCsv() {
    const rows = [
      ["Name", "Phone", "Email", "DOB", "Created", "Orders", "Total Spent"],
      ...customers.map((customer) => [
        customer.name,
        customer.phone ?? "",
        customer.email ?? "",
        customer.dob ?? "",
        formatUtcToIst(customer.created_at),
        String(customer.totalOrders),
        String(customer.totalSpent),
      ]),
    ];
    downloadCsv("customers.csv", rows);
  }

  function resetForm() {
    setForm(initialForm);
    setActionError(null);
  }

  function openAdd() {
    resetForm();
    setIsAddOpen(true);
  }

  function openEdit(customer: CustomerRecord) {
    setActionError(null);
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      dob: customer.dob ?? "",
    });
  }

  async function submitAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);

    try {
      await onAdd({
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        dob: form.dob || null,
      });
      setIsAddOpen(false);
      resetForm();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Unable to add customer.");
    }
  }

  async function submitEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingCustomer) {
      return;
    }

    setActionError(null);

    try {
      await onEdit(editingCustomer.id, {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        dob: form.dob || null,
      });
      setEditingCustomer(null);
      resetForm();
    } catch (submitError) {
      setActionError(submitError instanceof Error ? submitError.message : "Unable to update customer.");
    }
  }

  async function handleDelete(customerId: string) {
    setActionError(null);
    try {
      await onDelete(customerId);
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : "Unable to deactivate customer.");
    }
  }

  async function confirmDeleteCustomer() {
    if (!pendingDeleteCustomer) {
      return;
    }

    await handleDelete(pendingDeleteCustomer.id);
    setPendingDeleteCustomer(null);
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-text">Customers</h3>
          <p className="text-base text-muted-foreground">Manage customer records and spend history.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={exportCustomersCsv} disabled={customers.length === 0}>
            Export CSV
          </Button>
          <Button type="button" onClick={openAdd}>Add Customer</Button>
        </div>
      </div>

      <div>
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search by name, phone, or email"
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
        />
      </div>

      {actionError && (
        <div className="rounded-lg border border-primary/50 bg-primary/10 p-3 text-sm text-primary">{actionError}</div>
      )}

      <DataState
        loading={loading && !hasRows}
        error={error}
        empty={!loading && !error && !hasRows}
        emptyLabel={searchQuery ? "No customers match your search." : "No customers yet."}
      />

      {hasRows && !error && (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-base">
            <thead className="bg-muted text-left text-sm uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Phone</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">DOB</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Orders</th>
                <th className="px-3 py-3">Spent</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-muted/40">
                  <td className="px-3 py-3 text-text">{customer.name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{customer.phone ?? "-"}</td>
                  <td className="px-3 py-3 text-muted-foreground">{customer.email ?? "-"}</td>
                  <td className="px-3 py-3 text-muted-foreground">{formatDateOnly(customer.dob)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{formatUtcToIst(customer.created_at)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{customer.totalOrders}</td>
                  <td className="px-3 py-3 text-muted-foreground">{formatCurrency(customer.totalSpent)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => openEdit(customer)}
                        className="rounded-md border border-border px-2 py-1 text-sm text-muted-foreground hover:text-text"
                        disabled={saving}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteCustomer(customer)}
                        className="rounded-md border border-primary/50 px-2 py-1 text-sm text-primary"
                        disabled={saving}
                      >
                        Deactivate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ListPaginationControls
        loadedCount={customers.length}
        totalCount={pagination.totalCount}
        hasMore={pagination.hasMore}
        loading={pagination.loadingMore}
        onShowMore={pagination.onShowMore}
        onShowAll={pagination.onShowAll}
        itemLabel="customers"
      />

      <EntityModal open={isAddOpen} title="Add Customer" onClose={() => setIsAddOpen(false)}>
        <CustomerForm
          form={form}
          onChange={setForm}
          onSubmit={submitAdd}
          saving={saving}
          submitLabel="Create Customer"
        />
      </EntityModal>

      <EntityModal
        open={Boolean(editingCustomer)}
        title="Edit Customer"
        onClose={() => setEditingCustomer(null)}
      >
        <CustomerForm
          form={form}
          onChange={setForm}
          onSubmit={submitEdit}
          saving={saving}
          submitLabel="Save Changes"
        />
      </EntityModal>

      <EntityModal
        open={Boolean(pendingDeleteCustomer)}
        title="Confirm customer deactivation"
        onClose={() => setPendingDeleteCustomer(null)}
      >
        <div className="space-y-4">
          <p className="text-base text-muted-foreground">
            Deactivate customer <span className="font-semibold text-text">{pendingDeleteCustomer?.name}</span>? The
            record will stay in the database with an end date and inactive status.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setPendingDeleteCustomer(null)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void confirmDeleteCustomer()} disabled={saving}>
              {saving ? "Deactivating..." : "Deactivate"}
            </Button>
          </div>
        </div>
      </EntityModal>
    </div>
  );
}

function CustomerForm({
  form,
  onChange,
  onSubmit,
  saving,
  submitLabel,
}: {
  form: CustomerFormState;
  onChange: (next: CustomerFormState) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  saving: boolean;
  submitLabel: string;
}) {
  return (
    <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
      <label className="block text-base text-muted-foreground">
        <span className="mb-1 block">Name</span>
        <input
          required
          value={form.name}
          onChange={(event) => onChange({ ...form, name: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
        />
      </label>

      <label className="block text-base text-muted-foreground">
        <span className="mb-1 block">Phone</span>
        <input
          value={form.phone}
          onChange={(event) => onChange({ ...form, phone: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
        />
      </label>

      <label className="block text-base text-muted-foreground">
        <span className="mb-1 block">Email</span>
        <input
          type="email"
          value={form.email}
          onChange={(event) => onChange({ ...form, email: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
        />
      </label>

      <label className="block text-base text-muted-foreground">
        <span className="mb-1 block">Date of birth</span>
        <input
          type="date"
          value={form.dob}
          onChange={(event) => onChange({ ...form, dob: event.target.value })}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-text"
        />
      </label>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Saving..." : submitLabel}
      </Button>
    </form>
  );
}
