export const CONSULT_STATUSES = ["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type ConsultStatus = (typeof CONSULT_STATUSES)[number];

export const CONSULT_VISIT_TYPES = ["new", "follow_up", "walk_in"] as const;
export type ConsultVisitType = (typeof CONSULT_VISIT_TYPES)[number];

export type ConsultDisplayStatus = "Waiting" | "In Progress" | "Completed";
export type ConsultDisplayType = "New" | "Follow-up" | "Walk-in";

export type ConsultationQueueSource = "consultation" | "appointment";

export type ConsultationRecord = {
  id: string;
  client_id: string;
  patient_id: string;
  appointment_id: string | null;
  doctor_id: string | null;
  visit_type: ConsultVisitType | null;
  status: ConsultStatus | null;
  findings: string | null;
  assessment: string | null;
  advice: string | null;
  medication_notes: string | null;
  exercise_notes: string | null;
  treatment_plan: string | null;
  other_notes: string | null;
  followup_date: string | null;
  followup_duration_days: number | null;
  followup_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ConsultationMedicationRecord = {
  id: string;
  client_id: string;
  consultation_id: string;
  medicine_name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
  instructions: string | null;
  created_at: string;
};

export type ConsultationExerciseRecord = {
  id: string;
  client_id: string;
  consultation_id: string;
  exercise_name: string;
  instructions: string | null;
  created_at: string;
};

export type ConsultationAttachmentRecord = {
  id: string;
  client_id: string;
  consultation_id: string;
  file_name: string;
  file_url: string;
  mime_type: string | null;
  file_size: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
};

export type ConsultationPatientSummary = {
  id: string;
  name: string;
  phone: string | null;
  dob: string | null;
};

export type ConsultationAppointmentSummary = {
  id: string;
  date: string | null;
  start_time: string | null;
  remark: string | null;
  service: string | null;
};

export type ConsultationDetail = ConsultationRecord & {
  patient: ConsultationPatientSummary | null;
  appointment: ConsultationAppointmentSummary | null;
  medications: ConsultationMedicationRecord[];
  exercises: ConsultationExerciseRecord[];
  attachments: ConsultationAttachmentRecord[];
};

export type ConsultationQueueRow = {
  id: string;
  patientId: string;
  name: string;
  initials: string;
  code: string;
  ageGender: string;
  type: ConsultDisplayType;
  reason: string;
  time: string;
  status: ConsultDisplayStatus;
  appointmentId: string | null;
  appointmentDate: string | null;
  appointmentTime: string | null;
  phone: string | null;
  source: ConsultationQueueSource;
};

export type ConsultationQueueStats = {
  todaysConsults: number;
  waiting: number;
  inProgress: number;
  completedToday: number;
  walkIns: number;
};

export type ConsultationMedicationInput = {
  medicineName: string;
  dosage?: string | null;
  frequency?: string | null;
  duration?: string | null;
  instructions?: string | null;
};

export type ConsultationExerciseInput = {
  exerciseName: string;
  instructions?: string | null;
};

export type ConsultationAttachmentInput = {
  fileName: string;
  fileUrl: string;
  mimeType?: string | null;
  fileSize?: number | null;
};

export type ConsultationPayload = {
  patientId: string;
  appointmentId?: string | null;
  visitType?: ConsultVisitType | null;
  status?: ConsultStatus | null;
  findings?: string | null;
  assessment?: string | null;
  advice?: string | null;
  medicationNotes?: string | null;
  exerciseNotes?: string | null;
  treatmentPlan?: string | null;
  otherNotes?: string | null;
  followupDate?: string | null;
  followupDurationDays?: number | null;
  followupNotes?: string | null;
  medications?: ConsultationMedicationInput[];
  exercises?: ConsultationExerciseInput[];
};

export type ConsultationHistoryItem = {
  id: string;
  filter: "Consults";
  date: string;
  time: string;
  title: string;
  status: string;
  statusTone: string;
  ringTone: string;
};

const STATUS_TO_DISPLAY: Record<string, ConsultDisplayStatus> = {
  DRAFT: "Waiting",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  // tolerate legacy lowercase if any old rows exist
  draft: "Waiting",
  waiting: "Waiting",
  in_progress: "In Progress",
  completed: "Completed",
};

const DISPLAY_TO_STATUS: Record<ConsultDisplayStatus, ConsultStatus> = {
  Waiting: "DRAFT",
  "In Progress": "IN_PROGRESS",
  Completed: "COMPLETED",
};

const VISIT_TYPE_TO_DISPLAY: Record<string, ConsultDisplayType> = {
  new: "New",
  follow_up: "Follow-up",
  walk_in: "Walk-in",
};

const DISPLAY_TO_VISIT_TYPE: Record<ConsultDisplayType, ConsultVisitType> = {
  New: "new",
  "Follow-up": "follow_up",
  "Walk-in": "walk_in",
};

export function toDisplayStatus(status: string | null | undefined): ConsultDisplayStatus {
  if (!status) {
    return "Waiting";
  }

  return STATUS_TO_DISPLAY[status] ?? "Waiting";
}

export function toDbStatus(status: ConsultDisplayStatus): ConsultStatus {
  return DISPLAY_TO_STATUS[status];
}

export function toDisplayVisitType(visitType: string | null | undefined): ConsultDisplayType {
  if (!visitType) {
    return "New";
  }

  return VISIT_TYPE_TO_DISPLAY[visitType] ?? "New";
}

export function toDbVisitType(visitType: ConsultDisplayType): ConsultVisitType {
  return DISPLAY_TO_VISIT_TYPE[visitType];
}

export function getPatientInitials(name: string | null | undefined): string {
  if (!name) {
    return "?";
  }

  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function getPatientCode(patientId: string): string {
  return `PAT-${patientId.replace(/-/g, "").slice(0, 4).toUpperCase()}`;
}

export function formatPatientAge(dob: string | null | undefined): string {
  if (!dob) {
    return "—";
  }

  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) {
    return "—";
  }

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return `${age} Y`;
}
