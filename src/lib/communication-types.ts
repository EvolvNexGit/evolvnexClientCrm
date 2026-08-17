export type AutoReplyMatchMode = "exact" | "contains";

export type CommunicationAutoReply = {
  id: string;
  client_id: string;
  trigger_text: string;
  response_text: string;
  match_mode: AutoReplyMatchMode;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CommunicationAutoReplyPayload = {
  triggerText: string;
  responseText: string;
  matchMode: AutoReplyMatchMode;
  isActive: boolean;
  sortOrder?: number;
};

export type CommunicationMessageEvent = {
  id: string;
  client_id: string;
  provider: string;
  direction: "inbound" | "outbound";
  from_phone: string | null;
  to_phone: string | null;
  body: string | null;
  provider_message_id: string | null;
  status: string | null;
  created_at: string;
};

export type CommunicationProviderAccount = {
  id: string;
  client_id: string;
  provider: string;
  status: "disconnected" | "connected" | "error";
  phone_number_id: string | null;
  display_phone: string | null;
  waba_id: string | null;
};

export type WhatsAppConnectionPublic = {
  clientId: string;
  phoneNumberId: string | null;
  displayPhone: string | null;
  wabaId: string | null;
  status: "disconnected" | "connected" | "error";
  hasAccessToken: boolean;
  hasAppSecret: boolean;
  hasVerifyToken: boolean;
};

export type WhatsAppCredentialsPayload = {
  phoneNumberId: string;
  displayPhone?: string;
  wabaId?: string;
  accessToken?: string;
  appSecret?: string;
  verifyToken?: string;
};

export const DEFAULT_AUTO_REPLY_TRIGGER = "hi";
export const DEFAULT_AUTO_REPLY_RESPONSE =
  "Hello! Welcome to EvolvNex.\n\nFollowing are our offered services:\n• Consultation\n• Appointments\n• Follow-up care\n\nReply with the service name to learn more.";

export function normalizeTriggerText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
