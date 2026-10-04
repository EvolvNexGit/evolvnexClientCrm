import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import {
  billToAlertPayload,
  extractInsertedBill,
  sendNewOrderPush,
  shouldSendOrderPush,
} from "@/lib/web-push-server";

export const runtime = "nodejs";

function readProvidedSecret(request: NextRequest) {
  const headerSecret = request.headers.get("x-order-push-secret")?.trim() ?? "";
  if (headerSecret) {
    return headerSecret;
  }

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }

  return "";
}

function isAuthorized(request: NextRequest) {
  const expected = process.env.ORDER_PUSH_WEBHOOK_SECRET?.trim() ?? "";
  const provided = readProvidedSecret(request);

  if (!expected || !provided) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json()) as Record<string, unknown>;
    const eventType = String(payload.type ?? payload.eventType ?? "").toUpperCase();
    if (eventType && eventType !== "INSERT") {
      return NextResponse.json({ ok: true, skipped: "not_insert" });
    }

    const table = String(payload.table ?? "").toLowerCase();
    if (table && table !== "bills") {
      return NextResponse.json({ ok: true, skipped: "not_bills" });
    }

    const bill = extractInsertedBill(payload);
    if (!bill) {
      return NextResponse.json({ ok: true, skipped: "missing_record" });
    }

    if (!shouldSendOrderPush(bill)) {
      return NextResponse.json({ ok: true, skipped: "pos_order" });
    }

    const clientId = bill.client_id != null ? String(bill.client_id) : "";
    const alertPayload = billToAlertPayload(bill);
    if (!clientId || !alertPayload) {
      return NextResponse.json({ ok: true, skipped: "missing_order" });
    }

    const result = await sendNewOrderPush(clientId, alertPayload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[order-push] failed", error);
    return NextResponse.json({ error: "Unable to send order push" }, { status: 500 });
  }
}
