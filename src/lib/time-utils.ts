export function formatUtcToIst(value: string | Date | null | undefined, opts?: { withSeconds?: boolean }) {
  if (!value) return "-";

  const date = typeof value === "string" ? new Date(value) : value;
  if (!date || Number.isNaN(date.getTime())) return String(value);

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: opts?.withSeconds ? "2-digit" : undefined,
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const day = get("day");
  const month = get("month");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const second = opts?.withSeconds ? get("second") : "";

  // Return in ISO-like format: YYYY-MM-DD HH:mm[:ss]
  return `${year}-${month}-${day} ${hour}:${minute}${opts?.withSeconds ? `:${second}` : ""}`;
}

export default formatUtcToIst;
