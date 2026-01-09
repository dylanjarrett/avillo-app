import { NextRequest, NextResponse } from "next/server";
import { sendSms } from "@/lib/twilioClient";
import { requireWorkspace } from "@/lib/workspace"; // <- wherever this file lives

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ws = await requireWorkspace();
    if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

    const { to, body, contactId } = await req.json();

    if (!to || !body) {
      return NextResponse.json({ error: "Missing 'to' or 'body' in request." }, { status: 400 });
    }

    const message = await sendSms({
      userId: ws.userId,
      workspaceId: ws.workspaceId,     // ✅ REQUIRED
      to,
      body,
      contactId: contactId ?? undefined,
      source: "manual",
    });

    return NextResponse.json({ sid: message.sid, status: message.status });
  } catch (error: any) {
    console.error("[SMS] Error sending SMS:", error);
    return NextResponse.json({ error: error?.message ?? "Failed to send SMS." }, { status: 500 });
  }
}