import { NextRequest, NextResponse } from "next/server";
import { saveWhatsAppCredentials, disconnectWhatsAppCredentials } from "@/lib/communication-credentials";
import { getAuthenticatedRequestClient } from "@/lib/server/request-auth";

export const runtime = "nodejs";

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: NextRequest) {
  try {
    const { clientId, supabase } = await getAuthenticatedRequestClient(
      request.headers.get("authorization"),
    );
    const body = (await request.json()) as Record<string, unknown>;

    const connection = await saveWhatsAppCredentials({
      supabase,
      clientId,
      phoneNumberId: asTrimmed(body.phoneNumberId),
      displayPhone: asTrimmed(body.displayPhone) || null,
      wabaId: asTrimmed(body.wabaId) || null,
      secrets: {
        accessToken: asTrimmed(body.accessToken),
        appSecret: asTrimmed(body.appSecret),
        verifyToken: asTrimmed(body.verifyToken),
      },
    });

    return NextResponse.json({ connection });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save WhatsApp credentials.";
    const status =
      message.includes("access token") || message.includes("session")
        ? 401
        : message.includes("required")
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { clientId, supabase } = await getAuthenticatedRequestClient(
      request.headers.get("authorization"),
    );

    const connection = await disconnectWhatsAppCredentials({ supabase, clientId });
    return NextResponse.json({ connection });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to disconnect WhatsApp credentials.";
    const status = message.includes("session") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
