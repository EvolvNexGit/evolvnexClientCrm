"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useDoctorPrintProfiles } from "@/hooks/use-doctor-print-profiles";
import {
  DOCTOR_PRINT_TEXT_LIMITS,
  parseOptionalMargin,
  type DoctorPrintMode,
  type DoctorPrintProfilePayload,
  type DoctorPrintProfileRecord,
} from "@/lib/doctor-print-profile-types";
import { PRINT_MARGIN_KEYS, PRINT_MARGIN_LIMITS_MM, type PrintMarginKey } from "@/lib/print-settings-types";
import { cn } from "@/lib/utils";

type DoctorPrintProfilesSectionProps = {
  clientId: string;
};

type ProfileFormProps = {
  doctorName: string;
  profile: DoctorPrintProfileRecord | null;
  saving: boolean;
  saveError: string | null;
  onSave: (payload: DoctorPrintProfilePayload) => Promise<void>;
  onRemove: (profileId: string) => Promise<void>;
};

const FIELD_CLASS = "min-h-11 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-text outline-none";

function marginToField(value: number | null): string {
  return value === null ? "" : String(value);
}

function ProfileForm({ doctorName, profile, saving, saveError, onSave, onRemove }: ProfileFormProps) {
  const [mode, setMode] = useState<DoctorPrintMode>(profile?.mode ?? "letterhead");
  const [clinicName, setClinicName] = useState(profile?.clinic_name ?? "");
  const [displayName, setDisplayName] = useState(profile?.doctor_display_name ?? "");
  const [qualification, setQualification] = useState(profile?.qualification ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [regNo, setRegNo] = useState(profile?.reg_no ?? "");
  const [gstNo, setGstNo] = useState(profile?.gst_no ?? "");
  const [margins, setMargins] = useState<Record<PrintMarginKey, string>>({
    header_mm: marginToField(profile?.header_mm ?? null),
    footer_mm: marginToField(profile?.footer_mm ?? null),
    left_mm: marginToField(profile?.left_mm ?? null),
    right_mm: marginToField(profile?.right_mm ?? null),
  });
  const [isDefault, setIsDefault] = useState(profile?.is_default ?? false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<PrintMarginKey, string>>>({});
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    const errors: Partial<Record<PrintMarginKey, string>> = {};
    const parsedMargins: Record<PrintMarginKey, number | null> = {
      header_mm: null,
      footer_mm: null,
      left_mm: null,
      right_mm: null,
    };

    for (const key of PRINT_MARGIN_KEYS) {
      const result = parseOptionalMargin(key, margins[key]);
      if (result.ok) {
        parsedMargins[key] = result.value;
      } else {
        errors[key] = result.error;
      }
    }

    setFieldErrors(errors);
    setSaved(false);
    if (Object.keys(errors).length > 0) {
      return;
    }

    try {
      await onSave({
        doctorName,
        mode,
        clinicName,
        doctorDisplayName: displayName,
        qualification,
        address,
        phone,
        regNo,
        gstNo,
        headerMm: parsedMargins.header_mm,
        footerMm: parsedMargins.footer_mm,
        leftMm: parsedMargins.left_mm,
        rightMm: parsedMargins.right_mm,
        isDefault,
      });
      setSaved(true);
    } catch {
      // The hook exposes the failure through saveError.
    }
  };

  const handleRemove = async () => {
    if (!profile) {
      return;
    }

    try {
      await onRemove(profile.id);
    } catch {
      setConfirmRemove(false);
    }
  };

  const textField = (
    id: string,
    label: string,
    value: string,
    onChange: (next: string) => void,
    maxLength: number,
  ) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-text">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(event) => {
          setSaved(false);
          onChange(event.target.value);
        }}
        className={FIELD_CLASS}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1 text-sm font-medium text-text">Print template</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(
            [
              ["letterhead", "Letterhead (pre-printed)"],
              ["standard", "Standard (printed header)"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setSaved(false);
                setMode(value);
              }}
              className={cn(
                "min-h-11 rounded-xl border px-3 py-2 text-sm font-medium",
                mode === value
                  ? "border-primary bg-muted text-text"
                  : "border-border bg-background text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {mode === "standard" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {textField("doctor-profile-clinic", "Clinic name", clinicName, setClinicName, DOCTOR_PRINT_TEXT_LIMITS.clinicName)}
          {textField(
            "doctor-profile-display",
            "Doctor name on receipt",
            displayName,
            setDisplayName,
            DOCTOR_PRINT_TEXT_LIMITS.doctorDisplayName,
          )}
          {textField(
            "doctor-profile-qualification",
            "Qualification",
            qualification,
            setQualification,
            DOCTOR_PRINT_TEXT_LIMITS.qualification,
          )}
          {textField("doctor-profile-phone", "Phone", phone, setPhone, DOCTOR_PRINT_TEXT_LIMITS.phone)}
          <div className="sm:col-span-2">
            <label htmlFor="doctor-profile-address" className="mb-1 block text-sm font-medium text-text">
              Address
            </label>
            <textarea
              id="doctor-profile-address"
              value={address}
              maxLength={DOCTOR_PRINT_TEXT_LIMITS.address}
              rows={3}
              onChange={(event) => {
                setSaved(false);
                setAddress(event.target.value);
              }}
              className={cn(FIELD_CLASS, "min-h-20")}
            />
          </div>
          {textField("doctor-profile-reg", "Registration no.", regNo, setRegNo, DOCTOR_PRINT_TEXT_LIMITS.regNo)}
          {textField("doctor-profile-gst", "GST no.", gstNo, setGstNo, DOCTOR_PRINT_TEXT_LIMITS.gstNo)}
        </div>
      ) : null}

      <div>
        <p className="mb-1 text-sm font-medium text-text">Margin overrides (optional)</p>
        <p className="mb-2 text-xs text-muted-foreground">Leave blank to use the default margins for this template.</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {PRINT_MARGIN_KEYS.map((key) => {
            const limits = PRINT_MARGIN_LIMITS_MM[key];
            const inputId = `doctor-profile-margin-${key}`;
            return (
              <div key={key}>
                <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-text">
                  {limits.label} (mm, {limits.min}-{limits.max})
                </label>
                <input
                  id={inputId}
                  type="number"
                  step={0.5}
                  inputMode="decimal"
                  min={limits.min}
                  max={limits.max}
                  value={margins[key]}
                  onChange={(event) => {
                    setSaved(false);
                    setMargins((current) => ({ ...current, [key]: event.target.value }));
                  }}
                  className={FIELD_CLASS}
                />
                {fieldErrors[key] ? (
                  <p className="mt-1 text-xs text-primary" role="alert">
                    {fieldErrors[key]}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-text">
        <input
          type="checkbox"
          checked={isDefault}
          onChange={(event) => {
            setSaved(false);
            setIsDefault(event.target.checked);
          }}
          className="h-5 w-5 accent-primary"
        />
        Use as default for doctors without a profile
      </label>

      {saveError ? (
        <p className="text-sm text-primary" role="alert">
          {saveError}
        </p>
      ) : null}
      {saved && !saveError ? (
        <p className="text-sm text-muted-foreground" role="status">
          Saved
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void handleSave()} disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </Button>
        {profile && !confirmRemove ? (
          <Button variant="secondary" onClick={() => setConfirmRemove(true)} disabled={saving}>
            Remove profile
          </Button>
        ) : null}
        {profile && confirmRemove ? (
          <>
            <span className="text-sm text-text">Remove this profile?</span>
            <Button variant="secondary" onClick={() => void handleRemove()} disabled={saving}>
              Yes, remove
            </Button>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)} disabled={saving}>
              Keep
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function DoctorPrintProfilesSection({ clientId }: DoctorPrintProfilesSectionProps) {
  const { profiles, doctorNames, loading, error, saving, saveError, refresh, save, remove } =
    useDoctorPrintProfiles(clientId);
  const [selected, setSelected] = useState("");
  // Bumped after a removal so the form re-initialises blank; saves keep the form mounted so "Saved" stays visible.
  const [resetCount, setResetCount] = useState(0);
  const selectedName = doctorNames.includes(selected) ? selected : "";
  const selectedProfile =
    profiles.find((profile) => profile.doctor_name.trim().toLowerCase() === selectedName.trim().toLowerCase()) ?? null;

  return (
    <section className="space-y-3" aria-labelledby="doctor-print-profiles-heading">
      <div>
        <h3 id="doctor-print-profiles-heading" className="text-base font-semibold text-text">
          Doctor profile / print
        </h3>
        <p className="text-sm text-muted-foreground">
          Profiles apply to clinic receipts. Doctors without a profile use the default profile&apos;s clinic details,
          then the letterhead margins above.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading doctor profiles...</p> : null}

      {!loading && error ? (
        <div className="flex flex-wrap items-center gap-2" role="alert">
          <p className="text-sm text-primary">{error}</p>
          <Button variant="secondary" onClick={() => void refresh()}>
            Retry
          </Button>
        </div>
      ) : null}

      {!loading && !error && doctorNames.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No doctors yet. Doctor names come from the Staff field on appointments.
        </p>
      ) : null}

      {!loading && !error && doctorNames.length > 0 ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="doctor-profile-select" className="mb-1 block text-sm font-medium text-text">
              Doctor
            </label>
            <select
              id="doctor-profile-select"
              value={selectedName}
              onChange={(event) => setSelected(event.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">Select a doctor</option>
              {doctorNames.map((name) => {
                const hasProfile = profiles.some(
                  (profile) => profile.doctor_name.trim().toLowerCase() === name.toLowerCase(),
                );
                return (
                  <option key={name} value={name}>
                    {hasProfile ? `${name} (profile saved)` : name}
                  </option>
                );
              })}
            </select>
          </div>

          {selectedName ? (
            <ProfileForm
              key={`${selectedName}:${resetCount}`}
              doctorName={selectedName}
              profile={selectedProfile}
              saving={saving}
              saveError={saveError}
              onSave={save}
              onRemove={async (profileId) => {
                await remove(profileId);
                setResetCount((count) => count + 1);
              }}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
