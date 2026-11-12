"use client";

type PatientStripProps = {
  name: string;
  age: string;
  /** string = recorded text, null = not recorded, undefined = patient row could not be loaded. */
  allergies: string | null | undefined;
};

export function PatientStrip({ name, age, allergies }: PatientStripProps) {
  return (
    <div
      role="region"
      aria-label="Patient summary"
      className="sticky top-0 z-20 rounded-2xl border border-border bg-card px-4 py-3 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 max-w-full truncate font-semibold text-text">{name}</span>
        <span className="text-sm text-muted-foreground">{age}</span>
        {typeof allergies === "string" ? (
          <span
            title={allergies}
            className="line-clamp-2 max-w-full break-words rounded-xl border border-primary/50 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
          >
            Allergies: {allergies}
          </span>
        ) : allergies === null ? (
          <span className="text-xs text-muted-foreground">Allergies: not recorded</span>
        ) : (
          <span className="text-xs text-muted-foreground">Allergies: unavailable</span>
        )}
      </div>
    </div>
  );
}
