"use client";

import { useState } from "react";
import {
  buildInstallmentRows,
  formatPaiseInput,
  parseMoneyPaise,
  validateInstallmentSchedule,
  type ScheduleFailure,
  type ScheduleInputRow,
} from "@/lib/package-ledger";
import { PACKAGE_LIMITS, formatPackageMoney } from "@/lib/package-types";
import { cn } from "@/lib/utils";

/** One editable row; amounts stay text while typing and are parsed to integer paise only for checks and submit. */
export type ScheduleDraftRow = { dueOn: string; amount: string };

const inputClass =
  "w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-base text-text placeholder:text-muted-foreground sm:text-sm";

/** Draft rows as integer-paise rows; an unparsable amount becomes 0 so the validator reports it. */
export function draftToRows(rows: ReadonlyArray<ScheduleDraftRow>): ScheduleInputRow[] {
  return rows.map((row) => ({ dueOn: row.dueOn, amountPaise: parseMoneyPaise(row.amount) ?? 0 }));
}

const FAILURE_TEXT: Record<ScheduleFailure, string> = {
  total: "Enter the total price above first.",
  count: `Use ${PACKAGE_LIMITS.installmentsMin} to ${PACKAGE_LIMITS.installmentsMax} installments.`,
  amount: "Every installment needs an amount above zero (up to two decimals).",
  date: "Every installment needs a valid due date.",
  range: "A due date is too far in the past or in the future.",
  order: "Due dates must not go backwards.",
  sum: "The installments must add up to the total price.",
};

/** Message for a schedule failure (also used by the sell form on submit). */
export function describeScheduleFailure(reason: ScheduleFailure): string {
  return FAILURE_TEXT[reason];
}

/**
 * Installment schedule editor: choose a count and the first due date, "Split evenly" fills equal amounts with the
 * remainder on the last row (so the rows always add up), then every date and amount stays editable. A live check
 * shows the running sum against the total; the database re-validates the same rules when the package is sold.
 */
export function InstallmentScheduleEditor({
  totalPaise,
  today,
  rows,
  onChange,
}: {
  totalPaise: number | null;
  today: string;
  rows: ScheduleDraftRow[];
  onChange: (rows: ScheduleDraftRow[]) => void;
}) {
  const [count, setCount] = useState("3");
  const [firstDueOn, setFirstDueOn] = useState(today);

  const countValue = /^\d{1,3}$/.test(count.trim()) ? Number(count.trim()) : null;
  const canSplit =
    totalPaise !== null &&
    totalPaise > 0 &&
    countValue !== null &&
    countValue >= PACKAGE_LIMITS.installmentsMin &&
    countValue <= PACKAGE_LIMITS.installmentsMax &&
    firstDueOn !== "";

  const check = validateInstallmentSchedule(draftToRows(rows), totalPaise ?? 0, today);
  const sumPaise = check.sumPaise;
  const differencePaise = (totalPaise ?? 0) - sumPaise;

  function handleSplit() {
    if (!canSplit || totalPaise === null || countValue === null) {
      return;
    }
    onChange(
      buildInstallmentRows({ totalPaise, count: countValue, firstDueOn }).map((row) => ({
        dueOn: row.dueOn,
        amount: formatPaiseInput(row.amountPaise),
      })),
    );
  }

  function updateRow(index: number, patch: Partial<ScheduleDraftRow>) {
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>Installments</span>
          <input
            value={count}
            onChange={(event) => setCount(event.target.value.replace(/\D/g, "").slice(0, 3))}
            inputMode="numeric"
            aria-label="Number of installments"
            className={inputClass}
          />
        </label>
        <label className="space-y-1 text-sm text-muted-foreground">
          <span>First due</span>
          <input
            type="date"
            value={firstDueOn}
            onChange={(event) => setFirstDueOn(event.target.value)}
            className={inputClass}
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={handleSplit}
            disabled={!canSplit}
            className="min-h-11 w-full rounded-xl border border-border px-3 text-sm font-medium text-text hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            Split evenly
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Enter the total price, pick a count and the first due date, then choose Split evenly. The last installment
          takes any rounding remainder.
        </p>
      ) : (
        <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
          {rows.map((row, index) => (
            <li key={index} className="grid grid-cols-[2rem_1fr_1fr] items-center gap-2">
              <span className="text-sm text-muted-foreground">{index + 1}</span>
              <input
                type="date"
                value={row.dueOn}
                onChange={(event) => updateRow(index, { dueOn: event.target.value })}
                aria-label={`Installment ${index + 1} due date`}
                className={inputClass}
              />
              <input
                value={row.amount}
                onChange={(event) => updateRow(index, { amount: event.target.value })}
                inputMode="decimal"
                aria-label={`Installment ${index + 1} amount`}
                className={inputClass}
              />
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <p
          role="status"
          className={cn("text-sm", check.ok ? "text-emerald-600" : "text-amber-600")}
        >
          {check.ok
            ? `Adds up to ${formatPackageMoney(sumPaise / 100)}.`
            : `${FAILURE_TEXT[check.reason]}${
                check.reason === "sum"
                  ? ` Now ${formatPackageMoney(sumPaise / 100)} of ${formatPackageMoney((totalPaise ?? 0) / 100)} (${
                      differencePaise > 0 ? "short by" : "over by"
                    } ${formatPackageMoney(Math.abs(differencePaise) / 100)}).`
                  : ""
              }`}
        </p>
      )}
    </div>
  );
}
