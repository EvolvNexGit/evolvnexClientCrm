export const CONSULTATION_FILES_BUCKET = "consultation-files";

export const CONSULTATION_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const CONSULTATION_FILE_ACCEPT = CONSULTATION_FILE_TYPES.join(",");

export const CONSULTATION_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** Signed URLs for health files are created at click time and expire after five minutes. */
export const SIGNED_URL_TTL_SECONDS = 300;

export type ConsultationFileLike = { name: string; type: string; size: number };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Returns a user-facing error message, or null when the file may be uploaded. */
export function validateConsultationFile(file: ConsultationFileLike): string | null {
  if (!(CONSULTATION_FILE_TYPES as readonly string[]).includes(file.type)) {
    return "Only PDF, JPG, PNG or WebP files are allowed.";
  }

  if (file.size <= 0) {
    return "File is empty.";
  }

  if (file.size > CONSULTATION_FILE_MAX_BYTES) {
    return "File is larger than 10 MB.";
  }

  return null;
}

/** Restricts an uploaded file name to a safe charset for use inside an object path. */
export function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "");
  const tail = cleaned.slice(-100).replace(/^\.+/, "");

  return tail || "file";
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Object path: client_id/consultation_id/uuid-safeName. Both ids must be uuids. */
export function buildStoragePath(
  clientId: string,
  consultationId: string,
  uniqueId: string,
  fileName: string,
): string {
  if (!isUuid(clientId) || !isUuid(consultationId)) {
    throw new Error("Invalid file location.");
  }

  return `${clientId}/${consultationId}/${uniqueId}-${safeFileName(fileName)}`;
}

/** Only http(s) URLs may become links; javascript:, data: and the like never do. */
export function isSafeHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}
