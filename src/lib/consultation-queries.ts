import { formatSupabaseError, getSupabaseClient } from "@/lib/supabase";
import { formatUtcToIst, formatUtcToIstTimeLabel } from "@/lib/time-utils";
import { parseVitals } from "@/lib/consultation-vitals";
import {
  buildStoragePath,
  CONSULTATION_FILES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  validateConsultationFile,
} from "@/lib/consultation-files";
import {
  formatPatientAge,
  getPatientCode,
  getPatientInitials,
  toDisplayStatus,
  toDisplayVisitType,
  type ConsultationAttachmentInput,
  type ConsultationAttachmentRecord,
  type ConsultationDetail,
  type ConsultationExerciseInput,
  type ConsultationHistoryItem,
  type ConsultationMedicationInput,
  type ConsultationPayload,
  type ConsultationQueueRow,
  type ConsultationQueueStats,
  type ConsultationRecord,
  type ConsultStatus,
} from "@/lib/consultation-types";

const CONSULTATION_SELECT = `
  id,
  client_id,
  patient_id,
  appointment_id,
  doctor_id,
  visit_type,
  status,
  findings,
  assessment,
  advice,
  medication_notes,
  exercise_notes,
  treatment_plan,
  other_notes,
  followup_date,
  followup_duration_days,
  followup_notes,
  vitals,
  created_by,
  created_at,
  updated_at,
  customers:patient_id (id, name, phone, dob, allergies),
  appointments:appointment_id (id, date, start_time, remark, service)
`;

function getClient() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Missing Supabase environment variables.");
  }

  return supabase;
}

function raiseQueryError(error: unknown, fallback: string): never {
  throw new Error(formatSupabaseError(error, fallback));
}

function getTodayIstDate(): string {
  return formatUtcToIst(new Date().toISOString()).slice(0, 10);
}

function isSameIstDay(value: string | null | undefined, targetDate: string): boolean {
  if (!value) {
    return false;
  }

  return formatUtcToIst(value).slice(0, 10) === targetDate;
}

function mapPatient(raw: unknown) {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object") {
    return null;
  }

  const patient = row as Record<string, unknown>;
  // Blank allergies means "not recorded", never "none".
  const allergies = typeof patient.allergies === "string" ? patient.allergies.trim() : "";
  return {
    id: String(patient.id ?? ""),
    name: String(patient.name ?? "Unknown patient"),
    phone: (patient.phone as string | null) ?? null,
    dob: (patient.dob as string | null) ?? null,
    allergies: allergies || null,
  };
}

function mapAppointment(raw: unknown) {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== "object") {
    return null;
  }

  const appointment = row as Record<string, unknown>;
  return {
    id: String(appointment.id ?? ""),
    date: (appointment.date as string | null) ?? null,
    start_time: (appointment.start_time as string | null) ?? null,
    remark: (appointment.remark as string | null) ?? null,
    service: (appointment.service as string | null) ?? null,
  };
}

function mapConsultationRecord(row: Record<string, unknown>): ConsultationRecord {
  return {
    id: String(row.id),
    client_id: String(row.client_id),
    patient_id: String(row.patient_id),
    appointment_id: row.appointment_id ? String(row.appointment_id) : null,
    doctor_id: row.doctor_id ? String(row.doctor_id) : null,
    visit_type: (row.visit_type as ConsultationRecord["visit_type"]) ?? null,
    status: (row.status as ConsultationRecord["status"]) ?? null,
    findings: (row.findings as string | null) ?? null,
    assessment: (row.assessment as string | null) ?? null,
    advice: (row.advice as string | null) ?? null,
    medication_notes: (row.medication_notes as string | null) ?? null,
    exercise_notes: (row.exercise_notes as string | null) ?? null,
    treatment_plan: (row.treatment_plan as string | null) ?? null,
    other_notes: (row.other_notes as string | null) ?? null,
    followup_date: (row.followup_date as string | null) ?? null,
    followup_duration_days:
      row.followup_duration_days == null ? null : Number(row.followup_duration_days),
    followup_notes: (row.followup_notes as string | null) ?? null,
    vitals: parseVitals(row.vitals),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

function mapQueueRow(row: Record<string, unknown>): ConsultationQueueRow {
  const consultation = mapConsultationRecord(row);
  const patient = mapPatient(row.customers);
  const appointment = mapAppointment(row.appointments);
  const patientId = patient?.id ?? consultation.patient_id;
  const patientName = patient?.name ?? "Unknown patient";

  const appointmentTime = appointment?.start_time
    ? formatUtcToIstTimeLabel(appointment.start_time)
    : "—";

  const reason =
    consultation.findings?.trim() ||
    appointment?.remark?.trim() ||
    appointment?.service?.trim() ||
    "—";

  return {
    id: consultation.id,
    patientId,
    name: patientName,
    initials: getPatientInitials(patientName),
    code: getPatientCode(patientId),
    ageGender: formatPatientAge(patient?.dob),
    type: toDisplayVisitType(consultation.visit_type),
    reason,
    time: appointmentTime,
    status: toDisplayStatus(consultation.status),
    appointmentId: consultation.appointment_id,
    appointmentDate: appointment?.date ?? null,
    appointmentTime: appointment?.start_time ?? null,
    phone: patient?.phone ?? null,
    source: "consultation",
  };
}

function buildConsultationRow(clientId: string, payload: ConsultationPayload) {
  return {
    client_id: clientId,
    patient_id: payload.patientId,
    appointment_id: payload.appointmentId ?? null,
    visit_type: payload.visitType ?? "NEW",
    status: payload.status ?? "DRAFT",
    findings: payload.findings ?? null,
    assessment: payload.assessment ?? null,
    advice: payload.advice ?? null,
    medication_notes: payload.medicationNotes ?? null,
    exercise_notes: payload.exerciseNotes ?? null,
    treatment_plan: payload.treatmentPlan ?? null,
    other_notes: payload.otherNotes ?? null,
    followup_date: payload.followupDate ?? null,
    followup_duration_days: payload.followupDurationDays ?? null,
    followup_notes: payload.followupNotes ?? null,
    vitals: payload.vitals ?? null,
    updated_at: new Date().toISOString(),
  };
}

function isConsultationForToday(row: Record<string, unknown>, today: string): boolean {
  const consultation = mapConsultationRecord(row);
  const appointment = mapAppointment(row.appointments);

  if (isSameIstDay(consultation.created_at, today)) {
    return true;
  }

  return appointment?.date === today;
}

export async function fetchConsultationQueue(
  clientId: string,
  date = getTodayIstDate(),
): Promise<ConsultationQueueRow[]> {
  const supabase = getClient();

  const [consultationsResult, appointmentsResult] = await Promise.all([
    supabase
      .from("consultations")
      .select(CONSULTATION_SELECT)
      .eq("client_id", clientId)
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: false }),
    supabase
      .from("appointments")
      .select("id, name, phone, email, service, date, start_time, status, remark")
      .eq("client_id", clientId)
      .eq("date", date)
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .order("start_time", { ascending: true }),
  ]);

  if (consultationsResult.error) {
    raiseQueryError(consultationsResult.error, "Unable to load consultation queue.");
  }

  if (appointmentsResult.error) {
    raiseQueryError(appointmentsResult.error, "Unable to load today's appointments for the queue.");
  }

  const consultationRows = (consultationsResult.data ?? [])
    .filter((row) => isConsultationForToday(row as Record<string, unknown>, date))
    .map((row) => mapQueueRow(row as Record<string, unknown>));

  const linkedAppointmentIds = new Set(
    consultationRows.map((row) => row.appointmentId).filter((value): value is string => Boolean(value)),
  );

  const appointmentRows: ConsultationQueueRow[] = (appointmentsResult.data ?? [])
    .filter((appointment) => !linkedAppointmentIds.has(String(appointment.id)))
    .map((appointment) => {
      const name = String(appointment.name ?? "Unknown patient");
      const appointmentId = String(appointment.id);
      return {
        id: `appointment:${appointmentId}`,
        patientId: "",
        name,
        initials: getPatientInitials(name),
        code: "—",
        ageGender: "—",
        type: "New" as const,
        reason: String(appointment.remark ?? appointment.service ?? "—"),
        time: appointment.start_time ? formatUtcToIstTimeLabel(appointment.start_time) : "—",
        status: "Waiting" as const,
        appointmentId,
        appointmentDate: appointment.date ?? null,
        appointmentTime: appointment.start_time ?? null,
        phone: appointment.phone ?? null,
        source: "appointment" as const,
      };
    });

  return [...consultationRows, ...appointmentRows].sort((left, right) => {
    const leftTime = left.appointmentTime ?? "";
    const rightTime = right.appointmentTime ?? "";
    return leftTime.localeCompare(rightTime);
  });
}

export function buildConsultationQueueStats(rows: ConsultationQueueRow[]): ConsultationQueueStats {
  return {
    todaysConsults: rows.length,
    waiting: rows.filter((row) => row.status === "Waiting").length,
    inProgress: rows.filter((row) => row.status === "In Progress").length,
    completedToday: rows.filter((row) => row.status === "Completed").length,
    walkIns: rows.filter((row) => row.type === "Walk-in").length,
  };
}

export async function fetchConsultationQueueStats(
  clientId: string,
  date = getTodayIstDate(),
): Promise<ConsultationQueueStats> {
  const rows = await fetchConsultationQueue(clientId, date);
  return buildConsultationQueueStats(rows);
}

function mapAttachmentRow(item: Record<string, unknown>): ConsultationAttachmentRecord {
  return {
    id: String(item.id),
    client_id: String(item.client_id),
    consultation_id: String(item.consultation_id),
    file_name: String(item.file_name ?? ""),
    file_url: String(item.file_url ?? ""),
    storage_path: item.storage_path ? String(item.storage_path) : null,
    mime_type: item.mime_type == null ? null : String(item.mime_type),
    file_size: item.file_size == null ? null : Number(item.file_size),
    uploaded_by: item.uploaded_by ? String(item.uploaded_by) : null,
    uploaded_at: String(item.uploaded_at ?? ""),
  };
}

export async function fetchConsultationById(
  clientId: string,
  consultationId: string,
): Promise<ConsultationDetail | null> {
  const supabase = getClient();

  const { data, error } = await supabase
    .from("consultations")
    .select(CONSULTATION_SELECT)
    .eq("client_id", clientId)
    .eq("id", consultationId)
    .maybeSingle();

  if (error) {
    raiseQueryError(error, "Unable to load consultation.");
  }

  if (!data) {
    return null;
  }

  const row = data as Record<string, unknown>;
  const consultation = mapConsultationRecord(row);

  const [medicationsResult, exercisesResult, attachmentsResult] = await Promise.all([
    supabase
      .from("consultation_medications")
      .select("*")
      .eq("client_id", clientId)
      .eq("consultation_id", consultationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("consultation_exercises")
      .select("*")
      .eq("client_id", clientId)
      .eq("consultation_id", consultationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("consultation_attachments")
      .select("*")
      .eq("client_id", clientId)
      .eq("consultation_id", consultationId)
      .order("uploaded_at", { ascending: false }),
  ]);

  if (medicationsResult.error) {
    raiseQueryError(medicationsResult.error, "Unable to load consultation medications.");
  }

  if (exercisesResult.error) {
    raiseQueryError(exercisesResult.error, "Unable to load consultation exercises.");
  }

  if (attachmentsResult.error) {
    raiseQueryError(attachmentsResult.error, "Unable to load consultation attachments.");
  }

  return {
    ...consultation,
    patient: mapPatient(row.customers),
    appointment: mapAppointment(row.appointments),
    medications: (medicationsResult.data ?? []).map((item) => ({
      id: String(item.id),
      client_id: String(item.client_id),
      consultation_id: String(item.consultation_id),
      medicine_name: String(item.medicine_name ?? ""),
      dosage: item.dosage ?? null,
      frequency: item.frequency ?? null,
      duration: item.duration ?? null,
      instructions: item.instructions ?? null,
      created_at: String(item.created_at ?? ""),
    })),
    exercises: (exercisesResult.data ?? []).map((item) => ({
      id: String(item.id),
      client_id: String(item.client_id),
      consultation_id: String(item.consultation_id),
      exercise_name: String(item.exercise_name ?? ""),
      instructions: item.instructions ?? null,
      created_at: String(item.created_at ?? ""),
    })),
    attachments: (attachmentsResult.data ?? []).map((item) => mapAttachmentRow(item)),
  };
}

/** Caps how many of a patient's consultations are searched for attachments. */
const PATIENT_ATTACHMENT_CONSULTATION_LIMIT = 200;
const PATIENT_ATTACHMENT_ID_CHUNK_SIZE = 50;

export async function fetchPatientAttachments(
  clientId: string,
  patientId: string,
): Promise<ConsultationAttachmentRecord[]> {
  const supabase = getClient();

  const { data: consultationRows, error: consultationError } = await supabase
    .from("consultations")
    .select("id")
    .eq("client_id", clientId)
    .eq("patient_id", patientId)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: false })
    .limit(PATIENT_ATTACHMENT_CONSULTATION_LIMIT);

  if (consultationError) {
    raiseQueryError(consultationError, "Unable to load patient files.");
  }

  const consultationIds = (consultationRows ?? []).map((row) => String(row.id));
  if (consultationIds.length === 0) {
    return [];
  }

  // Chunk the id list so the PostgREST `in.(...)` URL stays well under common request-line limits.
  const chunks: string[][] = [];
  for (let index = 0; index < consultationIds.length; index += PATIENT_ATTACHMENT_ID_CHUNK_SIZE) {
    chunks.push(consultationIds.slice(index, index + PATIENT_ATTACHMENT_ID_CHUNK_SIZE));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("consultation_attachments")
        .select("*")
        .eq("client_id", clientId)
        .in("consultation_id", chunk)
        .order("uploaded_at", { ascending: false }),
    ),
  );

  const attachments: ConsultationAttachmentRecord[] = [];
  for (const { data, error } of results) {
    if (error) {
      raiseQueryError(error, "Unable to load patient files.");
    }
    attachments.push(...(data ?? []).map((item) => mapAttachmentRow(item)));
  }

  return attachments.sort((left, right) => right.uploaded_at.localeCompare(left.uploaded_at));
}

export async function fetchPatientConsultationHistory(
  clientId: string,
  patientId: string,
  excludeConsultationId?: string,
): Promise<ConsultationHistoryItem[]> {
  const supabase = getClient();

  let query = supabase
    .from("consultations")
    .select("id, visit_type, status, created_at")
    .eq("client_id", clientId)
    .eq("patient_id", patientId)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: false })
    .limit(20);

  if (excludeConsultationId) {
    query = query.neq("id", excludeConsultationId);
  }

  const { data, error } = await query;

  if (error) {
    raiseQueryError(error, "Unable to load patient consultation history.");
  }

  const today = getTodayIstDate();

  return (data ?? []).map((row) => {
    const createdAt = String(row.created_at ?? "");
    const createdDate = formatUtcToIst(createdAt).slice(0, 10);
    const dateLabel = createdDate === today ? `Today, ${formatUtcToIst(createdAt)}` : formatUtcToIst(createdAt);
    const displayStatus = toDisplayStatus(row.status as string | null);
    const visitType = toDisplayVisitType(row.visit_type as string | null);

    const statusTone =
      displayStatus === "Completed"
        ? "text-emerald-300"
        : displayStatus === "In Progress"
          ? "text-violet-300"
          : "text-amber-300";

    const ringTone =
      displayStatus === "Completed"
        ? "bg-emerald-500"
        : displayStatus === "In Progress"
          ? "bg-violet-500"
          : "bg-amber-500";

    return {
      id: String(row.id),
      filter: "Consults" as const,
      date: dateLabel,
      time: formatUtcToIstTimeLabel(createdAt),
      title: `${visitType} Consult`,
      status: displayStatus,
      statusTone,
      ringTone,
    };
  });
}

export async function createConsultation(clientId: string, payload: ConsultationPayload): Promise<string> {
  const supabase = getClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    raiseQueryError(authError, "Unable to verify signed-in user.");
  }

  if (!user?.id) {
    throw new Error("You must be signed in to create a consultation.");
  }

  // Client-generated id avoids depending on SELECT-after-INSERT (often blocked by RLS).
  const consultationId = crypto.randomUUID();

  const insertRow = {
    id: consultationId,
    ...buildConsultationRow(clientId, payload),
    doctor_id: user.id,
    created_by: user.id,
  };

  const { error } = await supabase.from("consultations").insert(insertRow);

  if (error) {
    // Retry once with lowercase visit_type if the DB uses a text/lowercase enum.
    const message = String(error.message ?? "");
    if (message.includes("visit_type") || message.includes("consultation_visit")) {
      const { error: retryError } = await supabase.from("consultations").insert({
        ...insertRow,
        visit_type: String(insertRow.visit_type ?? "NEW").toLowerCase(),
      });
      if (!retryError) {
        if (payload.medications) {
          await replaceConsultationMedications(clientId, consultationId, payload.medications);
        }
        if (payload.exercises) {
          await replaceConsultationExercises(clientId, consultationId, payload.exercises);
        }
        return consultationId;
      }
      raiseQueryError(retryError, "Unable to create consultation.");
    }

    raiseQueryError(error, "Unable to create consultation.");
  }

  if (payload.medications) {
    await replaceConsultationMedications(clientId, consultationId, payload.medications);
  }

  if (payload.exercises) {
    await replaceConsultationExercises(clientId, consultationId, payload.exercises);
  }

  return consultationId;
}

export async function replaceConsultationMedications(
  clientId: string,
  consultationId: string,
  medications: ConsultationMedicationInput[],
): Promise<void> {
  const supabase = getClient();

  const { error: deleteError } = await supabase
    .from("consultation_medications")
    .delete()
    .eq("client_id", clientId)
    .eq("consultation_id", consultationId);

  if (deleteError) {
    raiseQueryError(deleteError, "Unable to update consultation medications.");
  }

  const rows = medications
    .map((item) => ({
      client_id: clientId,
      consultation_id: consultationId,
      medicine_name: item.medicineName.trim(),
      dosage: item.dosage?.trim() || null,
      frequency: item.frequency?.trim() || null,
      duration: item.duration?.trim() || null,
      instructions: item.instructions?.trim() || null,
    }))
    .filter((item) => item.medicine_name.length > 0);

  if (rows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("consultation_medications").insert(rows);
  if (insertError) {
    raiseQueryError(insertError, "Unable to save consultation medications.");
  }
}

export async function replaceConsultationExercises(
  clientId: string,
  consultationId: string,
  exercises: ConsultationExerciseInput[],
): Promise<void> {
  const supabase = getClient();

  const { error: deleteError } = await supabase
    .from("consultation_exercises")
    .delete()
    .eq("client_id", clientId)
    .eq("consultation_id", consultationId);

  if (deleteError) {
    raiseQueryError(deleteError, "Unable to update consultation exercises.");
  }

  const rows = exercises
    .map((item) => ({
      client_id: clientId,
      consultation_id: consultationId,
      exercise_name: item.exerciseName.trim(),
      instructions: item.instructions?.trim() || null,
    }))
    .filter((item) => item.exercise_name.length > 0);

  if (rows.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("consultation_exercises").insert(rows);
  if (insertError) {
    raiseQueryError(insertError, "Unable to save consultation exercises.");
  }
}

export async function addConsultationAttachment(
  clientId: string,
  consultationId: string,
  payload: ConsultationAttachmentInput,
): Promise<void> {
  const supabase = getClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("consultation_attachments").insert({
    client_id: clientId,
    consultation_id: consultationId,
    file_name: payload.fileName.trim(),
    file_url: payload.fileUrl.trim(),
    mime_type: payload.mimeType ?? null,
    file_size: payload.fileSize ?? null,
    uploaded_by: user?.id ?? null,
  });

  if (error) {
    raiseQueryError(error, "Unable to add consultation attachment.");
  }
}

export async function fetchConsultationAttachments(
  clientId: string,
  consultationId: string,
): Promise<ConsultationAttachmentRecord[]> {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("consultation_attachments")
    .select("*")
    .eq("client_id", clientId)
    .eq("consultation_id", consultationId)
    .order("uploaded_at", { ascending: false });

  if (error) {
    raiseQueryError(error, "Unable to load consultation attachments.");
  }

  return (data ?? []).map((item) => mapAttachmentRow(item));
}

/** Uploads to the private bucket under the signed-in user's JWT, then records the row. */
export async function uploadConsultationFile(
  clientId: string,
  consultationId: string,
  file: File,
): Promise<void> {
  const invalidMessage = validateConsultationFile(file);
  if (invalidMessage) {
    throw new Error(invalidMessage);
  }

  const supabase = getClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const storagePath = buildStoragePath(clientId, consultationId, crypto.randomUUID(), file.name);
  const bucket = supabase.storage.from(CONSULTATION_FILES_BUCKET);

  const { error: uploadError } = await bucket.upload(storagePath, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) {
    raiseQueryError(uploadError, "Unable to upload file.");
  }

  const { error: insertError } = await supabase.from("consultation_attachments").insert({
    client_id: clientId,
    consultation_id: consultationId,
    file_name: file.name.trim().slice(0, 255) || "file",
    file_url: null,
    storage_path: storagePath,
    mime_type: file.type,
    file_size: file.size,
    uploaded_by: user?.id ?? null,
  });

  if (insertError) {
    // Best effort: do not leave an orphaned object behind a failed row insert.
    await bucket.remove([storagePath]);
    raiseQueryError(insertError, "Unable to save file record.");
  }
}

/** Creates a short-lived signed URL at click time. Never store or log the result. */
export async function getConsultationFileUrl(storagePath: string): Promise<string> {
  const supabase = getClient();
  const { data, error } = await supabase.storage
    .from(CONSULTATION_FILES_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    raiseQueryError(error, "Unable to open file.");
  }

  return data.signedUrl;
}

export async function deleteConsultationAttachment(
  clientId: string,
  attachmentId: string,
): Promise<void> {
  const supabase = getClient();
  const { error } = await supabase
    .from("consultation_attachments")
    .delete()
    .eq("client_id", clientId)
    .eq("id", attachmentId);

  if (error) {
    raiseQueryError(error, "Unable to remove consultation attachment.");
  }
}

/** Removes the bucket object first, then the row. Legacy rows (no storage_path) delete only the row. */
export async function deleteConsultationFile(
  clientId: string,
  attachment: ConsultationAttachmentRecord,
): Promise<void> {
  if (attachment.storage_path) {
    const supabase = getClient();
    const { data, error } = await supabase.storage
      .from(CONSULTATION_FILES_BUCKET)
      .remove([attachment.storage_path]);

    if (error) {
      raiseQueryError(error, "Unable to remove file.");
    }

    // An empty result means RLS hid the object: nothing was removed, so keep the row.
    if (!data || data.length !== 1) {
      throw new Error("The file could not be removed from storage, so nothing was deleted.");
    }
  }

  await deleteConsultationAttachment(clientId, attachment.id);
}

const CONSULTATION_ALREADY_COMPLETED_MESSAGE = "Consultation is already completed.";

export async function updateConsultation(
  clientId: string,
  consultationId: string,
  payload: Partial<ConsultationPayload>,
): Promise<void> {
  const supabase = getClient();

  const updateRow: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.patientId !== undefined) updateRow.patient_id = payload.patientId;
  if (payload.appointmentId !== undefined) updateRow.appointment_id = payload.appointmentId;
  if (payload.visitType !== undefined) updateRow.visit_type = payload.visitType;
  if (payload.status !== undefined) updateRow.status = payload.status;
  if (payload.findings !== undefined) updateRow.findings = payload.findings;
  if (payload.assessment !== undefined) updateRow.assessment = payload.assessment;
  if (payload.advice !== undefined) updateRow.advice = payload.advice;
  if (payload.medicationNotes !== undefined) updateRow.medication_notes = payload.medicationNotes;
  if (payload.exerciseNotes !== undefined) updateRow.exercise_notes = payload.exerciseNotes;
  if (payload.treatmentPlan !== undefined) updateRow.treatment_plan = payload.treatmentPlan;
  if (payload.otherNotes !== undefined) updateRow.other_notes = payload.otherNotes;
  if (payload.followupDate !== undefined) updateRow.followup_date = payload.followupDate;
  if (payload.followupDurationDays !== undefined) {
    updateRow.followup_duration_days = payload.followupDurationDays;
  }
  if (payload.followupNotes !== undefined) updateRow.followup_notes = payload.followupNotes;
  // Only written when provided, so status-only updates never wipe stored vitals.
  if (payload.vitals !== undefined) updateRow.vitals = payload.vitals;

  // A Completed consult is final (D-11): refuse before any child rows are touched.
  const { data: current, error: readError } = await supabase
    .from("consultations")
    .select("status")
    .eq("id", consultationId)
    .eq("client_id", clientId)
    .maybeSingle();

  if (readError) {
    raiseQueryError(readError, "Unable to update consultation.");
  }

  if (!current) {
    throw new Error("Consultation not found.");
  }

  if (current.status === "COMPLETED") {
    throw new Error(CONSULTATION_ALREADY_COMPLETED_MESSAGE);
  }

  // Children first, the consultation row (and so COMPLETED) last: if a child write fails
  // the consult stays editable instead of becoming a Completed visit with no medications.
  if (payload.medications) {
    await replaceConsultationMedications(clientId, consultationId, payload.medications);
  }

  if (payload.exercises) {
    await replaceConsultationExercises(clientId, consultationId, payload.exercises);
  }

  // The status guard also closes the race with another tab completing the visit after the read above.
  const { data: updated, error } = await supabase
    .from("consultations")
    .update(updateRow)
    .eq("id", consultationId)
    .eq("client_id", clientId)
    .or("status.is.null,status.neq.COMPLETED")
    .select("id");

  if (error) {
    raiseQueryError(error, "Unable to update consultation.");
  }

  if (!updated || updated.length === 0) {
    throw new Error(CONSULTATION_ALREADY_COMPLETED_MESSAGE);
  }
}

export async function setConsultationStatus(
  clientId: string,
  consultationId: string,
  status: ConsultStatus,
): Promise<void> {
  await updateConsultation(clientId, consultationId, { status });
}

async function findOrCreatePatientForAppointment(
  clientId: string,
  appointment: { name: string | null; phone: string | null; email?: string | null },
): Promise<string> {
  const supabase = getClient();
  const phone = (appointment.phone ?? "").trim();
  const name = (appointment.name ?? "").trim() || "Walk-in patient";

  if (phone) {
    const { data: byPhone, error: phoneError } = await supabase
      .from("customers")
      .select("id")
      .eq("client_id", clientId)
      .eq("is_active", true)
      .eq("phone", phone)
      .limit(1)
      .maybeSingle();

    if (phoneError) {
      raiseQueryError(phoneError, "Unable to match patient for appointment.");
    }

    if (byPhone?.id) {
      return String(byPhone.id);
    }
  }

  const { data: created, error: createError } = await supabase
    .from("customers")
    .insert({
      client_id: clientId,
      name,
      phone: phone || null,
      email: appointment.email ?? null,
    })
    .select("id")
    .single();

  if (createError) {
    raiseQueryError(createError, "Unable to create patient for appointment.");
  }

  return String(created.id);
}

export async function startConsultationFromAppointment(
  clientId: string,
  appointmentId: string,
): Promise<string> {
  const supabase = getClient();

  const { data: existing, error: existingError } = await supabase
    .from("consultations")
    .select("id, status")
    .eq("client_id", clientId)
    .eq("appointment_id", appointmentId)
    .neq("status", "CANCELLED")
    .limit(1)
    .maybeSingle();

  if (existingError) {
    raiseQueryError(existingError, "Unable to check existing consultation for appointment.");
  }

  if (existing?.id) {
    if (existing.status !== "IN_PROGRESS" && existing.status !== "COMPLETED") {
      await setConsultationStatus(clientId, String(existing.id), "IN_PROGRESS");
    }
    return String(existing.id);
  }

  const { data: appointment, error: appointmentError } = await supabase
    .from("appointments")
    .select("id, name, phone, email, remark, service")
    .eq("client_id", clientId)
    .eq("id", appointmentId)
    .is("deleted_at", null)
    .single();

  if (appointmentError) {
    raiseQueryError(appointmentError, "Unable to load appointment.");
  }

  const patientId = await findOrCreatePatientForAppointment(clientId, {
    name: appointment.name,
    phone: appointment.phone,
    email: appointment.email,
  });

  return createConsultation(clientId, {
    patientId,
    appointmentId,
    visitType: "NEW",
    status: "IN_PROGRESS",
    findings: appointment.remark ?? appointment.service ?? null,
  });
}
