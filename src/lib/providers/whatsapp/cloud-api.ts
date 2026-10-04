/**
 * WhatsApp Cloud API client — provider-specific. Do not import Meta details into generic UI.
 */

export type WhatsAppSendTextResult = {
  messageId: string | null;
  raw: unknown;
};

function getApiVersion(): string {
  return process.env.WHATSAPP_API_VERSION?.trim() || "v21.0";
}

export async function sendWhatsAppTextMessage(params: {
  phoneNumberId: string;
  toPhone: string;
  body: string;
  accessToken: string;
}): Promise<WhatsAppSendTextResult> {
  const phoneNumberId = params.phoneNumberId.trim();
  const toPhone = params.toPhone.replace(/\D/g, "");
  const body = params.body.trim();
  const accessToken = params.accessToken.trim();

  if (!phoneNumberId) {
    throw new Error("WhatsApp phone_number_id is required.");
  }
  if (!toPhone) {
    throw new Error("Recipient phone is required.");
  }
  if (!body) {
    throw new Error("Message body is required.");
  }
  if (!accessToken) {
    throw new Error("WhatsApp access token is required.");
  }

  const url = `https://graph.facebook.com/${getApiVersion()}/${phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone,
      type: "text",
      text: {
        preview_url: false,
        body,
      },
    }),
  });

  const raw = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      raw && typeof raw === "object" && "error" in raw
        ? JSON.stringify((raw as { error: unknown }).error)
        : `WhatsApp API error (${response.status})`;
    throw new Error(message);
  }

  const messageId =
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { messages?: Array<{ id?: string }> }).messages)
      ? ((raw as { messages: Array<{ id?: string }> }).messages[0]?.id ?? null)
      : null;

  return { messageId, raw };
}
