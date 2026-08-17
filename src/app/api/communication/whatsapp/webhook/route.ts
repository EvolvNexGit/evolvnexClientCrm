import { NextRequest, NextResponse } from "next/server";
import {
  handleWhatsAppWebhookPayload,
  verifyWhatsAppSignature,
  verifyWhatsAppWebhookChallenge,
} from "@/lib/providers/whatsapp/webhook";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const challenge = await verifyWhatsAppWebhookChallenge({
      mode: params.get("hub.mode"),
      verifyToken: params.get("hub.verify_token"),
      challenge: params.get("hub.challenge"),
    });

    if (!challenge) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("[whatsapp-webhook] verify failed", error);
    return new NextResponse("Server misconfigured", { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-hub-signature-256");

    if (!(await verifyWhatsAppSignature(rawBody, signature))) {
      console.error("[whatsapp-webhook] invalid signature");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const result = await handleWhatsAppWebhookPayload(payload);

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[whatsapp-webhook] processing failed", error);
    // Return 200 for Meta retry storms only when payload was accepted but business logic failed?
    // Prefer 500 so Meta retries transient failures.
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
