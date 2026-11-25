"use client";

import { useState } from "react";
import { PACKAGE_LIMITS, type PackageLabels } from "@/lib/package-types";
import { formatSupabaseError } from "@/lib/supabase";

/**
 * Cancel a package after an explicit confirmation. Open sessions are voided; payments and used sessions are kept
 * (there is no refund flow). The reason is optional and bounded like the database check.
 */
export function CancelPackageControl({
  labels,
  saving,
  onCancel,
}: {
  labels: PackageLabels;
  saving: boolean;
  onCancel: (reason: string | null) => Promise<unknown>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (saving) {
      return;
    }
    if (reason.trim().length > PACKAGE_LIMITS.noteMax) {
      setError(`The reason must be ${PACKAGE_LIMITS.noteMax} characters or fewer.`);
      return;
    }
    try {
      setError(null);
      await onCancel(reason.trim() || null);
      setConfirming(false);
      setReason("");
    } catch (cancelError) {
      setError(formatSupabaseError(cancelError, `Unable to cancel the ${labels.package.toLowerCase()}.`));
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="min-h-11 rounded-xl border border-rose-500/40 px-3 text-sm text-rose-500 hover:bg-rose-500/10"
      >
        Cancel {labels.package.toLowerCase()}
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-rose-500/40 bg-rose-500/5 p-3">
      <p className="text-sm text-text">
        Cancel this {labels.package.toLowerCase()}? Booked and undecided {labels.sessions.toLowerCase()} are removed.
        Payments and used {labels.sessions.toLowerCase()} are kept. This cannot be undone.
      </p>
      <label className="block space-y-1 text-sm text-muted-foreground">
        <span>Reason (optional)</span>
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={PACKAGE_LIMITS.noteMax}
          className="w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text sm:text-sm"
        />
      </label>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={saving}
          className="min-h-11 rounded-xl border border-border px-3 text-sm text-text hover:bg-muted disabled:opacity-60"
        >
          Keep {labels.package.toLowerCase()}
        </button>
        <button
          type="button"
          onClick={() => void handleConfirm()}
          disabled={saving}
          className="min-h-11 rounded-xl bg-rose-600 px-3 text-sm font-medium text-white hover:bg-rose-600/90 disabled:opacity-60"
        >
          {saving ? "Cancelling..." : "Yes, cancel"}
        </button>
      </div>
    </div>
  );
}
