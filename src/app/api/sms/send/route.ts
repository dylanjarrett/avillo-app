import { NextRequest, NextResponse } from "next/server";
import { sendSms } from "@/lib/twilioClient";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"; 

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userId = (session as any)?.user?.id;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { to, body, contactId } = await req.json();

    if (!to || !body) {
      return NextResponse.json(
        { error: "Missing 'to' or 'body' in request." },
        { status: 400 }
      );
    }

    const message = await sendSms({
      userId,
      to,
      body,
      contactId: contactId ?? null,
      source: "manual",
    });

    return NextResponse.json({
      sid: message.sid,
      status: message.status,
    });
  } catch (error: any) {
    console.error("[SMS] Error sending SMS:", error);
    return NextResponse.json(
      { error: error?.message ?? "Failed to send SMS." },
      { status: 500 }
    );
  }
}
