const POS_SKIP_KEY_PREFIX = "crm-order-alert-pos-ids";
const MAX_STORED_POS_IDS = 200;

function hasWindow() {
  return typeof window !== "undefined";
}

function getPosSkipKey(clientId: string) {
  return `${POS_SKIP_KEY_PREFIX}-${clientId}`;
}

function readPosSkipIds(clientId: string) {
  if (!hasWindow()) {
    return new Set<string>();
  }

  try {
    const raw = window.sessionStorage.getItem(getPosSkipKey(clientId));
    if (!raw) {
      return new Set<string>();
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return new Set<string>();
    }

    return new Set(
      parsed
        .map((entry) => String(entry ?? "").trim())
        .filter(Boolean)
        .slice(-MAX_STORED_POS_IDS),
    );
  } catch {
    return new Set<string>();
  }
}

/** POS checkout from this CRM browser — do not beep for our own bills. */
export function rememberLocalPosOrderId(clientId: string, orderId: string) {
  const id = String(orderId ?? "").trim();
  if (!hasWindow() || !clientId || !id) {
    return;
  }

  const next = readPosSkipIds(clientId);
  next.add(id);

  try {
    window.sessionStorage.setItem(
      getPosSkipKey(clientId),
      JSON.stringify(Array.from(next).slice(-MAX_STORED_POS_IDS)),
    );
  } catch {
    // no-op
  }
}

export function isLocalPosOrderId(clientId: string, orderId: string) {
  return readPosSkipIds(clientId).has(String(orderId ?? "").trim());
}

export function isPosOrderSource(orderSource: unknown) {
  return String(orderSource ?? "").trim().toUpperCase() === "POS";
}
