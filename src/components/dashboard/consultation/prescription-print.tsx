"use client";

import { formatPatientAge, type ConsultationDetail } from "@/lib/consultation-types";
import { formatUtcToIst } from "@/lib/time-utils";

type PrescriptionPrintProps = {
  detail: ConsultationDetail;
};

/** Formats a stored YYYY-MM-DD without a Date parse of the ISO string, so no timezone can move the day. */
function formatDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return value;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function nonBlank(value: string | null | undefined) {
  return value?.trim() ? value.trim() : null;
}

const HEADING_CLASS = "text-[10pt] font-semibold uppercase tracking-wide";

/**
 * Body-only prescription for pre-printed letterhead: patient line, medications with notes,
 * advice and follow-up. No clinic header, doctor block or footer. Explicit black on white
 * because the app theme is dark and this goes to paper.
 */
export function PrescriptionPrint({ detail }: PrescriptionPrintProps) {
  const patientName = nonBlank(detail.patient?.name) ?? "Patient";
  // formatPatientAge returns a dash for an unparseable DOB; omit the age rather than print a lone dash.
  const formattedAge = detail.patient?.dob ? formatPatientAge(detail.patient.dob) : null;
  const age = formattedAge === "—" ? null : formattedAge;
  const visitDate = formatDateOnly(formatUtcToIst(detail.created_at).slice(0, 10));
  const medicationNotes = nonBlank(detail.medication_notes);
  const advice = nonBlank(detail.advice);
  const followupNotes = nonBlank(detail.followup_notes);
  const followupDate = detail.followup_date ? formatDateOnly(detail.followup_date) : null;
  const hasMedications = detail.medications.length > 0;
  const hasFollowup = Boolean(followupDate || followupNotes);
  const hasContent = hasMedications || Boolean(medicationNotes) || Boolean(advice) || hasFollowup;

  return (
    <div className="space-y-4 text-[11pt] leading-snug text-black">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <span className="font-semibold">{patientName}</span>
        {age ? <span>{age}</span> : null}
        <span>{visitDate}</span>
      </div>

      {!hasContent ? <p>No prescription content recorded.</p> : null}

      {hasMedications ? (
        <section>
          <h3 className={HEADING_CLASS}>Medications</h3>
          <table className="mt-1 w-full border-collapse text-left text-[10pt]">
            <thead>
              <tr className="border-b border-black">
                <th className="py-1 pr-2 font-semibold">#</th>
                <th className="py-1 pr-2 font-semibold">Medicine</th>
                <th className="py-1 pr-2 font-semibold">Dosage</th>
                <th className="py-1 pr-2 font-semibold">Frequency</th>
                <th className="py-1 pr-2 font-semibold">Duration</th>
                <th className="py-1 font-semibold">Instructions</th>
              </tr>
            </thead>
            <tbody>
              {detail.medications.map((medication, index) => (
                <tr key={medication.id} className="break-inside-avoid border-b border-black align-top">
                  <td className="py-1 pr-2">{index + 1}</td>
                  <td className="py-1 pr-2">{medication.medicine_name}</td>
                  <td className="py-1 pr-2">{medication.dosage ?? ""}</td>
                  <td className="py-1 pr-2">{medication.frequency ?? ""}</td>
                  <td className="py-1 pr-2">{medication.duration ?? ""}</td>
                  <td className="py-1">{medication.instructions ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {medicationNotes ? (
        <section className="break-inside-avoid">
          <h3 className={HEADING_CLASS}>Notes</h3>
          <p className="mt-1 whitespace-pre-wrap">{medicationNotes}</p>
        </section>
      ) : null}

      {advice ? (
        <section className="break-inside-avoid">
          <h3 className={HEADING_CLASS}>Advice</h3>
          <p className="mt-1 whitespace-pre-wrap">{advice}</p>
        </section>
      ) : null}

      {hasFollowup ? (
        <section className="break-inside-avoid">
          <h3 className={HEADING_CLASS}>Follow-up</h3>
          {followupDate ? <p className="mt-1">{followupDate}</p> : null}
          {followupNotes ? <p className="mt-1 whitespace-pre-wrap">{followupNotes}</p> : null}
        </section>
      ) : null}
    </div>
  );
}
