// src/app/api/sms/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sendSms } from "@/lib/twilioClient";

export async function POST(req: NextRequest) {
  try {
    const { to, body } = await req.json();

    if (!to || !body) {
      return NextResponse.json(
        { error: "Missing 'to' or 'body' in request." },
        { status: 400 }
      );
    }

    const message = await sendSms(to, body);

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