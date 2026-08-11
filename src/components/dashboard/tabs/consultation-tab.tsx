"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ChevronRight,
  Clock3,
  ClipboardList,
  FileText,
  Filter,
  History,
  Loader2,
  MoreHorizontal,
  Paperclip,
  Plus,
  Save,
  Search,
  Stethoscope,
  Trash2,
  UserCircle2,
  X,
} from "lucide-react";
import { DataState } from "@/components/dashboard/billing/data-state";
import { EntityModal } from "@/components/dashboard/billing/entity-modal";
import { Button } from "@/components/ui/button";
import { useConsultations } from "@/hooks/use-consultations";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { fetchCustomersPage } from "@/lib/billing-queries";
import type { CustomerRecord } from "@/lib/billing-types";
import {
  formatPatientAge,
  getPatientCode,
  getPatientInitials,
  toDbVisitType,
  toDisplayStatus,
  toDisplayVisitType,
  type ConsultationExerciseInput,
  type ConsultationMedicationInput,
  type ConsultationQueueRow,
  type ConsultDisplayStatus,
  type ConsultDisplayType,
} from "@/lib/consultation-types";
import { formatUtcToIstTimeLabel } from "@/lib/time-utils";

type ConsultMode = "queue" | "editor";
type QueueView = "All" | ConsultDisplayStatus;

const planTabs = ["Advice", "Medication", "Exercises", "Treatment Plan", "Others"] as const;
const historyFilters = ["All", "Consults", "Bills", "Reports", "Notes", "Docs"] as const;
const visitTypeOptions: ConsultDisplayType[] = ["New", "Follow-up", "Walk-in"];

type PlanTab = (typeof planTabs)[number];

type EditorFormState = {
  findings: string;
  assessment: string;
  advice: string;
  medicationNotes: string;
  exerciseNotes: string;
  treatmentPlan: string;
  otherNotes: string;
  followupDurationDays: string;
  followupDate: string;
  followupNotes: string;
};

type MedicationDraft = ConsultationMedicationInput & { key: string };
type ExerciseDraft = ConsultationExerciseInput & { key: string };

const emptyEditorForm: EditorFormState = {
  findings: "",
  assessment: "",
  advice: "",
  medicationNotes: "",
  exerciseNotes: "",
  treatmentPlan: "",
  otherNotes: "",
  followupDurationDays: "",
  followupDate: "",
  followupNotes: "",
};

function planFieldKey(tab: PlanTab): keyof EditorFormState {
  switch (tab) {
    case "Advice":
      return "advice";
    case "Medication":
      return "medicationNotes";
    case "Exercises":
      return "exerciseNotes";
    case "Treatment Plan":
      return "treatmentPlan";
    case "Others":
      return "otherNotes";
  }
}

function formFromConsultation(
  consultation: NonNullable<ReturnType<typeof useConsultations>["activeConsultation"]>,
): EditorFormState {
  return {
    findings: consultation.findings ?? "",
    assessment: consultation.assessment ?? "",
    advice: consultation.advice ?? "",
    medicationNotes: consultation.medication_notes ?? "",
    exerciseNotes: consultation.exercise_notes ?? "",
    treatmentPlan: consultation.treatment_plan ?? "",
    otherNotes: consultation.other_notes ?? "",
    followupDurationDays:
      consultation.followup_duration_days == null ? "" : String(consultation.followup_duration_days),
    followupDate: consultation.followup_date ?? "",
    followupNotes: consultation.followup_notes ?? "",
  };
}

function payloadFromForm(
  form: EditorFormState,
  medications: MedicationDraft[],
  exercises: ExerciseDraft[],
) {
  return {
    findings: form.findings.trim() || null,
    assessment: form.assessment.trim() || null,
    advice: form.advice.trim() || null,
    medicationNotes: form.medicationNotes.trim() || null,
    exerciseNotes: form.exerciseNotes.trim() || null,
    treatmentPlan: form.treatmentPlan.trim() || null,
    otherNotes: form.otherNotes.trim() || null,
    followupDate: form.followupDate.trim() || null,
    followupDurationDays:
      form.followupDurationDays.trim().length > 0 ? Number(form.followupDurationDays) : null,
    followupNotes: form.followupNotes.trim() || null,
    medications: medications.map(({ medicineName, dosage, frequency, duration, instructions }) => ({
      medicineName,
      dosage,
      frequency,
      duration,
      instructions,
    })),
    exercises: exercises.map(({ exerciseName, instructions }) => ({
      exerciseName,
      instructions,
    })),
  };
}

function formatAppointmentDate(date: string | null | undefined) {
  if (!date) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : date.slice(0, 10);
}

function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  ring,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: typeof CalendarClock;
  ring: string;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-text">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{subtext}</p>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${ring}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: ConsultDisplayStatus }) {
  const styles: Record<ConsultDisplayStatus, string> = {
    Waiting: "bg-amber-500/15 text-amber-300 border-amber-500/20",
    "In Progress": "bg-violet-500/15 text-violet-300 border-violet-500/20",
    Completed: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  };

  return <span className={`rounded-full border px-3 py-1 text-xs font-medium ${styles[status]}`}>{status}</span>;
}

function TypePill({ type }: { type: ConsultationQueueRow["type"] }) {
  const styles: Record<ConsultationQueueRow["type"], string> = {
    New: "bg-violet-500/15 text-violet-300",
    "Follow-up": "bg-sky-500/15 text-sky-300",
    "Walk-in": "bg-emerald-500/15 text-emerald-300",
  };

  return <span className={`rounded-full px-3 py-1 text-xs font-medium ${styles[type]}`}>{type}</span>;
}

function SectionLabel({
  number,
  title,
  icon: Icon,
}: {
  number: string;
  title: string;
  icon: typeof Stethoscope;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#ff4b5c]/10 text-[#ff7582] ring-1 ring-[#ff4b5c]/20">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-medium text-text">
        {number}. {title}
      </p>
    </div>
  );
}

function Toolbar() {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-4 py-3 text-muted-foreground">
      <Button variant="ghost" className="h-8 px-3 text-xs">
        Normal
      </Button>
      <Button variant="ghost" className="h-8 w-8 p-0">
        B
      </Button>
      <Button variant="ghost" className="h-8 w-8 p-0 italic">
        I
      </Button>
      <Button variant="ghost" className="h-8 w-8 p-0 underline">
        U
      </Button>
      <Button variant="ghost" className="h-8 w-8 p-0">
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    </div>
  );
}

function EditorCard({
  number,
  title,
  placeholder,
  value,
  onChange,
}: {
  number: string;
  title: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="p-4 pb-0">
        <SectionLabel number={number} title={title} icon={FileText} />
      </div>
      <Toolbar />
      <div className="p-4">
        <textarea
          rows={7}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="min-h-[180px] w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-text outline-none placeholder:text-muted-foreground"
        />
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>Enter structured clinical notes.</span>
          <span>{value.length} / 4000</span>
        </div>
      </div>
    </section>
  );
}

export default function ConsultationTab({ clientId }: { clientId: string }) {
  const {
    queueRows,
    stats,
    activeConsultation,
    patientHistory,
    loading,
    detailLoading,
    saving,
    error,
    startConsultation,
    saveConsultation,
    completeConsultation,
    cancelConsultation,
    clearActiveConsultation,
    addConsultation,
    attachFile,
    removeAttachment,
  } = useConsultations(clientId);

  const [mode, setMode] = useState<ConsultMode>("queue");
  const [queueView, setQueueView] = useState<QueueView>("All");
  const [activePlanTab, setActivePlanTab] = useState<PlanTab>("Advice");
  const [activeFilter, setActiveFilter] = useState<(typeof historyFilters)[number]>("All");
  const [editorForm, setEditorForm] = useState<EditorFormState>(emptyEditorForm);
  const [medications, setMedications] = useState<MedicationDraft[]>([]);
  const [exercises, setExercises] = useState<ExerciseDraft[]>([]);
  const [selectedRow, setSelectedRow] = useState<ConsultationQueueRow | null>(null);
  const [isNewConsultOpen, setIsNewConsultOpen] = useState(false);
  const [newVisitType, setNewVisitType] = useState<ConsultDisplayType>("New");
  const [patientSearch, setPatientSearch] = useState("");
  const [patientResults, setPatientResults] = useState<CustomerRecord[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<CustomerRecord | null>(null);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [attachmentName, setAttachmentName] = useState("");
  const [attachmentUrl, setAttachmentUrl] = useState("");

  const debouncedPatientSearch = useDebouncedValue(patientSearch, 250);

  useEffect(() => {
    if (activeConsultation) {
      setEditorForm(formFromConsultation(activeConsultation));
      setMedications(
        activeConsultation.medications.map((item) => ({
          key: item.id,
          medicineName: item.medicine_name,
          dosage: item.dosage,
          frequency: item.frequency,
          duration: item.duration,
          instructions: item.instructions,
        })),
      );
      setExercises(
        activeConsultation.exercises.map((item) => ({
          key: item.id,
          exerciseName: item.exercise_name,
          instructions: item.instructions,
        })),
      );
    }
  }, [activeConsultation]);

  useEffect(() => {
    if (!isNewConsultOpen) {
      return;
    }

    let cancelled = false;

    async function loadPatients() {
      setPatientsLoading(true);
      try {
        const result = await fetchCustomersPage(clientId, {
          limit: 8,
          offset: 0,
          search: debouncedPatientSearch,
        });
        if (!cancelled) {
          setPatientResults(result.items);
        }
      } catch {
        if (!cancelled) {
          setPatientResults([]);
        }
      } finally {
        if (!cancelled) {
          setPatientsLoading(false);
        }
      }
    }

    void loadPatients();
    return () => {
      cancelled = true;
    };
  }, [clientId, debouncedPatientSearch, isNewConsultOpen]);

  const queueStats = useMemo(
    () => [
      {
        label: "Today's Consults",
        value: String(stats.todaysConsults),
        subtext: "Total scheduled",
        icon: CalendarClock,
        ring: "bg-violet-500/20 text-violet-300",
      },
      {
        label: "Waiting",
        value: String(stats.waiting),
        subtext: "Patients waiting",
        icon: Clock3,
        ring: "bg-amber-500/20 text-amber-300",
      },
      {
        label: "In Progress",
        value: String(stats.inProgress),
        subtext: "Currently in consult",
        icon: Stethoscope,
        ring: "bg-emerald-500/20 text-emerald-300",
      },
      {
        label: "Completed Today",
        value: String(stats.completedToday),
        subtext: "Consults completed",
        icon: Check,
        ring: "bg-sky-500/20 text-sky-300",
      },
      {
        label: "Walk-ins",
        value: String(stats.walkIns),
        subtext: "Today",
        icon: UserCircle2,
        ring: "bg-slate-500/20 text-slate-300",
      },
    ],
    [stats],
  );

  const visibleHistory = useMemo(() => {
    if (activeFilter === "All" || activeFilter === "Consults") {
      return patientHistory;
    }

    return [];
  }, [activeFilter, patientHistory]);

  const queueRowsByView = useMemo(() => {
    if (queueView === "All") {
      return queueRows;
    }

    return queueRows.filter((row) => row.status === queueView);
  }, [queueRows, queueView]);

  const queueTabCounts = useMemo(
    () => ({
      all: queueRows.length,
      inProgress: queueRows.filter((row) => row.status === "In Progress").length,
      completed: queueRows.filter((row) => row.status === "Completed").length,
    }),
    [queueRows],
  );

  const planField = planFieldKey(activePlanTab);
  const planValue = editorForm[planField];

  const patientName = activeConsultation?.patient?.name ?? selectedRow?.name ?? "Unknown patient";
  const patientId = activeConsultation?.patient_id ?? selectedRow?.patientId ?? "";
  const patientInitials = getPatientInitials(patientName);
  const patientCode = patientId ? getPatientCode(patientId) : selectedRow?.code ?? "—";
  const patientAge = formatPatientAge(activeConsultation?.patient?.dob ?? null);
  const visitType = toDisplayVisitType(activeConsultation?.visit_type);
  const consultStatus = toDisplayStatus(activeConsultation?.status);

  const appointmentDate =
    formatAppointmentDate(activeConsultation?.appointment?.date) ??
    formatAppointmentDate(selectedRow?.appointmentDate);
  const appointmentTime =
    activeConsultation?.appointment?.start_time ?? selectedRow?.appointmentTime ?? null;
  const appointmentLabel =
    appointmentDate && appointmentTime
      ? `${appointmentDate} · ${formatUtcToIstTimeLabel(appointmentTime)}`
      : appointmentDate ?? "—";

  async function handleStartConsult(row: ConsultationQueueRow) {
    setSelectedRow(row);
    const detail = await startConsultation(row);
    if (detail) {
      setMode("editor");
    }
  }

  async function handleSaveDraft() {
    if (!activeConsultation) {
      return;
    }

    await saveConsultation(
      activeConsultation.id,
      payloadFromForm(editorForm, medications, exercises),
      "DRAFT",
    );
  }

  async function handleSaveComplete() {
    if (!activeConsultation) {
      return;
    }

    await completeConsultation(
      activeConsultation.id,
      payloadFromForm(editorForm, medications, exercises),
    );
    setMode("queue");
    clearActiveConsultation();
    setSelectedRow(null);
  }

  async function handleCancelConsult() {
    if (!activeConsultation) {
      setMode("queue");
      return;
    }

    await cancelConsultation(activeConsultation.id);
    setMode("queue");
    setSelectedRow(null);
  }

  function handleBackToQueue() {
    setMode("queue");
    clearActiveConsultation();
    setSelectedRow(null);
  }

  async function handleCreateConsult() {
    if (!selectedPatient) {
      return;
    }

    const detail = await addConsultation({
      patientId: selectedPatient.id,
      visitType: toDbVisitType(newVisitType),
      status: "IN_PROGRESS",
    });

    if (!detail) {
      return;
    }

    setSelectedRow({
      id: detail.id,
      patientId: selectedPatient.id,
      name: selectedPatient.name,
      initials: getPatientInitials(selectedPatient.name),
      code: getPatientCode(selectedPatient.id),
      ageGender: formatPatientAge(selectedPatient.dob),
      type: newVisitType,
      reason: "—",
      time: "—",
      status: "In Progress",
      appointmentId: null,
      appointmentDate: null,
      appointmentTime: null,
      phone: selectedPatient.phone,
      source: "consultation",
    });
    setIsNewConsultOpen(false);
    setSelectedPatient(null);
    setPatientSearch("");
    setNewVisitType("New");
    setMode("editor");
  }

  async function handleAddAttachment() {
    if (!activeConsultation || !attachmentName.trim() || !attachmentUrl.trim()) {
      return;
    }

    await attachFile(activeConsultation.id, {
      fileName: attachmentName.trim(),
      fileUrl: attachmentUrl.trim(),
    });
    setAttachmentName("");
    setAttachmentUrl("");
  }

  const newConsultModal = (
    <EntityModal
      open={isNewConsultOpen}
      title="New Consult"
      onClose={() => setIsNewConsultOpen(false)}
      contentClassName="sm:max-w-xl"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-text">Visit type</label>
          <div className="flex flex-wrap gap-2">
            {visitTypeOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setNewVisitType(option)}
                className={
                  newVisitType === option
                    ? "rounded-full bg-text px-4 py-2 text-sm font-medium text-background"
                    : "rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:text-text"
                }
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-text">Patient</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={patientSearch}
              onChange={(event) => {
                setPatientSearch(event.target.value);
                setSelectedPatient(null);
              }}
              placeholder="Search by name, phone, or email"
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-text outline-none"
            />
          </div>

          <div className="mt-3 max-h-56 overflow-y-auto rounded-xl border border-border">
            {patientsLoading ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching patients...
              </div>
            ) : patientResults.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">No patients found.</p>
            ) : (
              patientResults.map((patient) => {
                const isSelected = selectedPatient?.id === patient.id;
                return (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => {
                      setSelectedPatient(patient);
                      setPatientSearch(patient.name);
                    }}
                    className={
                      isSelected
                        ? "flex w-full flex-col items-start border-b border-border bg-primary/10 px-3 py-3 text-left last:border-0"
                        : "flex w-full flex-col items-start border-b border-border px-3 py-3 text-left hover:bg-muted last:border-0"
                    }
                  >
                    <span className="text-sm font-medium text-text">{patient.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[patient.phone, patient.email].filter(Boolean).join(" · ") || "No contact details"}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => setIsNewConsultOpen(false)}>
            Cancel
          </Button>
          <Button
            className="bg-[#6d28d9] text-white hover:bg-[#5b21b6]"
            disabled={!selectedPatient || saving}
            onClick={() => void handleCreateConsult()}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Start Consult
          </Button>
        </div>
      </div>
    </EntityModal>
  );

  if (mode === "queue") {
    return (
      <div className="space-y-6">
        <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-primary">Consultation Queue</p>
              <h2 className="enx-page-title mt-2">Manage today's consultations and patient queue.</h2>
              <p className="mt-1 text-sm text-muted-foreground">Select a patient and start the consult when you're ready.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                className="gap-2 bg-[#6d28d9] text-white hover:bg-[#5b21b6]"
                onClick={() => setIsNewConsultOpen(true)}
              >
                <Plus className="h-4 w-4" />
                New Consult
              </Button>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-xl border border-primary/50 bg-primary/10 p-5 text-base text-primary">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {queueStats.map((item) => (
            <StatCard key={item.label} {...item} />
          ))}
        </div>

        <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="flex min-w-0 items-center gap-4 overflow-x-auto border-b border-border px-4 pt-4 text-sm font-medium [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {[
              { key: "All", label: "Today's Queue", count: queueTabCounts.all },
              { key: "In Progress", label: "In Progress", count: queueTabCounts.inProgress },
              { key: "Completed", label: "Completed Today", count: queueTabCounts.completed },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setQueueView(tab.key as QueueView)}
                className={
                  queueView === tab.key
                    ? "shrink-0 border-b-2 border-primary pb-3 text-primary"
                    : "shrink-0 pb-3 text-muted-foreground hover:text-text"
                }
              >
                {tab.label} ({tab.count})
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading consultations...
            </div>
          ) : (
            <div className="min-w-0 p-4">
              <div className="space-y-3 xl:hidden">
                {queueRowsByView.length === 0 ? (
                  <DataState loading={false} error={null} empty emptyLabel="No consultations scheduled for today." />
                ) : (
                  queueRowsByView.map((row) => (
                    <article key={row.id} className="rounded-2xl border border-border bg-background p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#6d28d9] text-sm font-semibold text-white">
                          {row.initials}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-text">{row.name}</p>
                          <p className="text-sm text-muted-foreground">{row.time} · {row.type}</p>
                          <p className="mt-1 truncate text-sm text-muted-foreground">{row.reason}</p>
                        </div>
                        <StatusPill status={row.status} />
                      </div>
                      <Button
                        className="mt-3 w-full bg-[#6d28d9] text-white hover:bg-[#5b21b6]"
                        disabled={saving || row.status === "Completed"}
                        onClick={() => void handleStartConsult(row)}
                      >
                        {row.status === "In Progress" ? "Continue" : "Start Consult"}
                      </Button>
                    </article>
                  ))
                )}
              </div>
              <div className="hidden min-w-0 overflow-x-auto xl:block">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-border text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Patient</th>
                    <th className="px-4 py-3">Age</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Appt. Time</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {queueRowsByView.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10">
                        <DataState
                          loading={false}
                          error={null}
                          empty
                          emptyLabel="No consultations scheduled for today."
                        />
                      </td>
                    </tr>
                  ) : (
                    queueRowsByView.map((row, index) => (
                      <tr key={row.id} className="border-b border-border/70 last:border-0">
                        <td className="px-4 py-4 text-sm text-muted-foreground">{index + 1}</td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#6d28d9] text-sm font-semibold text-white">
                              {row.initials}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-text">{row.name}</p>
                              <p className="text-xs text-muted-foreground">{row.code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-text">{row.ageGender}</td>
                        <td className="px-4 py-4">
                          <TypePill type={row.type} />
                        </td>
                        <td className="px-4 py-4 text-sm text-text">{row.reason}</td>
                        <td className="px-4 py-4 text-sm text-text">{row.time}</td>
                        <td className="px-4 py-4">
                          <StatusPill status={row.status} />
                        </td>
                        <td className="px-4 py-4">
                          <Button
                            className="bg-[#6d28d9] text-white hover:bg-[#5b21b6]"
                            disabled={saving || row.status === "Completed"}
                            onClick={() => void handleStartConsult(row)}
                          >
                            {row.status === "In Progress" ? "Continue" : "Start Consult"}
                          </Button>
                        </td>
                        <td className="px-4 py-4 text-right text-muted-foreground">
                          <MoreHorizontal className="inline h-4 w-4" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border px-5 py-4 text-sm text-muted-foreground">
            <p>
              Showing {queueRowsByView.length === 0 ? 0 : 1} to {queueRowsByView.length} of{" "}
              {queueRowsByView.length} patients
            </p>
          </div>
        </section>

        {newConsultModal}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBackToQueue}
              className="rounded-full border border-border p-2 text-muted-foreground hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-primary">Consultation</p>
              <h2 className="enx-page-title mt-2">{visitType} Consult</h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" className="gap-2" onClick={handleBackToQueue}>
              <History className="h-4 w-4" />
              Back to Queue
            </Button>
            <Button
              variant="secondary"
              className="gap-2"
              disabled={saving || detailLoading}
              onClick={() => void handleSaveDraft()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save as Draft
            </Button>
            <Button
              className="gap-2 bg-[#ff4b5c] text-white hover:bg-[#e83d4d]"
              disabled={saving || detailLoading}
              onClick={() => void handleSaveComplete()}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Save & Complete
            </Button>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-primary/50 bg-primary/10 p-5 text-base text-primary">{error}</div>
      )}

      {detailLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-3xl border border-border bg-card p-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading consultation...
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                    {patientInitials}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-text">{patientName}</h3>
                      <span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                        {patientAge}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{patientCode}</p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border bg-background px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Appointment</p>
                    <p className="mt-1 text-sm text-text">{appointmentLabel}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Status</p>
                    <p className="mt-1 text-sm text-emerald-500">{consultStatus}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Visit Type</p>
                    <p className="mt-1 text-sm text-text">{visitType}</p>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-6 2xl:grid-cols-2">
              <EditorCard
                number="1"
                title="Findings / Symptoms"
                placeholder="Enter patient complaints, symptoms and findings..."
                value={editorForm.findings}
                onChange={(value) => setEditorForm((current) => ({ ...current, findings: value }))}
              />
              <EditorCard
                number="2"
                title="Assessment"
                placeholder="Enter diagnosis, assessment or clinical notes..."
                value={editorForm.assessment}
                onChange={(value) => setEditorForm((current) => ({ ...current, assessment: value }))}
              />
            </div>

            <section className="rounded-3xl border border-border bg-card shadow-sm">
              <div className="p-4 pb-0">
                <SectionLabel number="3" title="Plan" icon={ClipboardList} />
              </div>

              <div className="flex flex-wrap gap-2 border-b border-border px-4 pb-4">
                {planTabs.map((tab) => {
                  const active = activePlanTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setActivePlanTab(tab)}
                      className={
                        active
                          ? "rounded-full bg-text px-4 py-2 text-sm font-medium text-background"
                          : "rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground hover:text-text"
                      }
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>

              {activePlanTab === "Medication" ? (
                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Structured medications saved to consultation_medications.</p>
                    <Button
                      variant="secondary"
                      className="gap-2"
                      onClick={() =>
                        setMedications((current) => [
                          ...current,
                          {
                            key: `new-${Date.now()}`,
                            medicineName: "",
                            dosage: "",
                            frequency: "",
                            duration: "",
                            instructions: "",
                          },
                        ])
                      }
                    >
                      <Plus className="h-4 w-4" />
                      Add medicine
                    </Button>
                  </div>

                  {medications.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                      No medications added yet.
                    </p>
                  ) : (
                    medications.map((medication, index) => (
                      <div key={medication.key} className="grid gap-3 rounded-2xl border border-border bg-background p-4 sm:grid-cols-2">
                        <input
                          value={medication.medicineName}
                          onChange={(event) =>
                            setMedications((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, medicineName: event.target.value } : item,
                              ),
                            )
                          }
                          placeholder="Medicine name"
                          className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none sm:col-span-2"
                        />
                        <input
                          value={medication.dosage ?? ""}
                          onChange={(event) =>
                            setMedications((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, dosage: event.target.value } : item,
                              ),
                            )
                          }
                          placeholder="Dosage"
                          className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
                        />
                        <input
                          value={medication.frequency ?? ""}
                          onChange={(event) =>
                            setMedications((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, frequency: event.target.value } : item,
                              ),
                            )
                          }
                          placeholder="Frequency"
                          className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
                        />
                        <input
                          value={medication.duration ?? ""}
                          onChange={(event) =>
                            setMedications((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, duration: event.target.value } : item,
                              ),
                            )
                          }
                          placeholder="Duration"
                          className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
                        />
                        <div className="flex gap-2">
                          <input
                            value={medication.instructions ?? ""}
                            onChange={(event) =>
                              setMedications((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, instructions: event.target.value } : item,
                                ),
                              )
                            }
                            placeholder="Instructions"
                            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
                          />
                          <Button
                            variant="secondary"
                            className="h-10 w-10 p-0"
                            onClick={() =>
                              setMedications((current) => current.filter((_, itemIndex) => itemIndex !== index))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}

                  <textarea
                    rows={4}
                    value={editorForm.medicationNotes}
                    onChange={(event) =>
                      setEditorForm((current) => ({ ...current, medicationNotes: event.target.value }))
                    }
                    placeholder="Additional medication notes..."
                    className="min-h-[100px] w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none"
                  />
                </div>
              ) : activePlanTab === "Exercises" ? (
                <div className="space-y-4 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">Structured exercises saved to consultation_exercises.</p>
                    <Button
                      variant="secondary"
                      className="gap-2"
                      onClick={() =>
                        setExercises((current) => [
                          ...current,
                          { key: `new-${Date.now()}`, exerciseName: "", instructions: "" },
                        ])
                      }
                    >
                      <Plus className="h-4 w-4" />
                      Add exercise
                    </Button>
                  </div>

                  {exercises.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground">
                      No exercises added yet.
                    </p>
                  ) : (
                    exercises.map((exercise, index) => (
                      <div key={exercise.key} className="grid gap-3 rounded-2xl border border-border bg-background p-4">
                        <div className="flex gap-2">
                          <input
                            value={exercise.exerciseName}
                            onChange={(event) =>
                              setExercises((current) =>
                                current.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, exerciseName: event.target.value } : item,
                                ),
                              )
                            }
                            placeholder="Exercise name"
                            className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
                          />
                          <Button
                            variant="secondary"
                            className="h-10 w-10 p-0"
                            onClick={() =>
                              setExercises((current) => current.filter((_, itemIndex) => itemIndex !== index))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <textarea
                          rows={3}
                          value={exercise.instructions ?? ""}
                          onChange={(event) =>
                            setExercises((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, instructions: event.target.value } : item,
                              ),
                            )
                          }
                          placeholder="Instructions"
                          className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
                        />
                      </div>
                    ))
                  )}

                  <textarea
                    rows={4}
                    value={editorForm.exerciseNotes}
                    onChange={(event) =>
                      setEditorForm((current) => ({ ...current, exerciseNotes: event.target.value }))
                    }
                    placeholder="Additional exercise notes..."
                    className="min-h-[100px] w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none"
                  />
                </div>
              ) : (
                <>
                  <Toolbar />
                  <div className="p-4">
                    <textarea
                      rows={6}
                      value={planValue}
                      onChange={(event) =>
                        setEditorForm((current) => ({
                          ...current,
                          [planField]: event.target.value,
                        }))
                      }
                      placeholder={`Enter ${activePlanTab.toLowerCase()} for patient...`}
                      className="min-h-[160px] w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm text-text outline-none placeholder:text-muted-foreground"
                    />
                    <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Use a concise, action-oriented treatment plan.</span>
                      <span>{planValue.length} / 4000</span>
                    </div>
                  </div>
                </>
              )}
            </section>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
                <div className="p-0 pb-3">
                  <SectionLabel number="4" title="Attachments" icon={Paperclip} />
                </div>
                <div className="grid gap-4">
                  <div className="grid gap-3 rounded-2xl border border-border bg-background p-4 sm:grid-cols-[1fr_1fr_auto]">
                    <input
                      value={attachmentName}
                      onChange={(event) => setAttachmentName(event.target.value)}
                      placeholder="File name"
                      className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
                    />
                    <input
                      value={attachmentUrl}
                      onChange={(event) => setAttachmentUrl(event.target.value)}
                      placeholder="File URL"
                      className="rounded-xl border border-border bg-card px-3 py-2 text-sm outline-none"
                    />
                    <Button
                      variant="secondary"
                      disabled={saving || !attachmentName.trim() || !attachmentUrl.trim()}
                      onClick={() => void handleAddAttachment()}
                    >
                      Add
                    </Button>
                  </div>

                  <div className="rounded-2xl border border-border bg-background p-5">
                    <p className="text-sm font-medium text-text">
                      Attached Files ({activeConsultation?.attachments.length ?? 0})
                    </p>
                    {activeConsultation?.attachments.length ? (
                      <ul className="mt-3 space-y-2">
                        {activeConsultation.attachments.map((attachment) => (
                          <li key={attachment.id} className="flex items-center justify-between gap-3">
                            <a
                              href={attachment.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-primary hover:underline"
                            >
                              {attachment.file_name}
                            </a>
                            <Button
                              variant="secondary"
                              className="h-8 w-8 p-0"
                              disabled={saving}
                              onClick={() => void removeAttachment(activeConsultation.id, attachment.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-sm text-muted-foreground">No files attached yet</p>
                    )}
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
                <div className="p-0 pb-3">
                  <SectionLabel number="5" title="Follow-up" icon={CalendarClock} />
                </div>

                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Duration (days)</p>
                      <input
                        type="number"
                        min={0}
                        value={editorForm.followupDurationDays}
                        onChange={(event) =>
                          setEditorForm((current) => ({
                            ...current,
                            followupDurationDays: event.target.value,
                          }))
                        }
                        placeholder="7"
                        className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-text outline-none"
                      />
                    </div>
                    <div className="rounded-2xl border border-border bg-background p-4">
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Follow-up Date</p>
                      <input
                        type="date"
                        value={editorForm.followupDate}
                        onChange={(event) =>
                          setEditorForm((current) => ({
                            ...current,
                            followupDate: event.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-text outline-none"
                      />
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border bg-background p-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Notes (Optional)</p>
                    <textarea
                      rows={4}
                      value={editorForm.followupNotes}
                      onChange={(event) =>
                        setEditorForm((current) => ({
                          ...current,
                          followupNotes: event.target.value,
                        }))
                      }
                      placeholder="e.g. Review pain score and ROM..."
                      className="mt-2 w-full resize-none rounded-xl border border-border bg-card px-3 py-2 text-sm text-text outline-none placeholder:text-muted-foreground"
                    />
                    <div className="mt-2 text-right text-xs text-muted-foreground">
                      {editorForm.followupNotes.length} / 300
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button
                variant="secondary"
                className="gap-2 border-[#ff4b5c]/30 text-[#cc3d4a] hover:bg-[#ff4b5c]/5"
                disabled={saving}
                onClick={() => void handleCancelConsult()}
              >
                Cancel Consult
              </Button>
              <Button variant="secondary" className="gap-2" disabled={saving} onClick={() => void handleSaveDraft()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save as Draft
              </Button>
              <Button
                className="gap-2 bg-[#ff4b5c] text-white hover:bg-[#e83d4d]"
                disabled={saving}
                onClick={() => void handleSaveComplete()}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save & Complete
              </Button>
            </div>
          </div>

          <aside className="rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-semibold text-text">Patient History</h3>
                <p className="mt-1 text-xs uppercase tracking-wider text-muted-foreground">Recent activity timeline</p>
              </div>
              <button type="button" className="rounded-full border border-border p-2 text-muted-foreground xl:hidden">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-border py-4">
              <div className="mb-3 flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <input
                  placeholder="Search history"
                  className="h-8 flex-1 bg-transparent text-sm text-text outline-none placeholder:text-muted-foreground"
                />
                <button type="button" className="text-muted-foreground">
                  <Filter className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {historyFilters.map((filter) => {
                  const active = activeFilter === filter;
                  return (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setActiveFilter(filter)}
                      className={
                        active
                          ? "rounded-full border border-[#ff4b5c] bg-[#ff4b5c]/10 px-3 py-1.5 text-xs font-medium text-[#cc3d4a]"
                          : "rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:text-text"
                      }
                    >
                      {filter}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 py-4">
              {visibleHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground">No consultation history for this patient yet.</p>
              ) : (
                visibleHistory.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-border bg-background p-4">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-full ${item.ringTone} text-white`}>
                        <Stethoscope className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{item.date}</p>
                            <h4 className="mt-1 text-sm font-semibold text-text">{item.title}</h4>
                            <p className={`mt-1 text-xs font-medium ${item.statusTone}`}>{item.status}</p>
                          </div>
                          <p className="shrink-0 text-xs text-muted-foreground">{item.time}</p>
                        </div>
                      </div>
                      <ChevronRight className="mt-1 h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
