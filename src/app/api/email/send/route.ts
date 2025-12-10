// src/app/api/email/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/resendClient";

export async function POST(req: NextRequest) {
  try {
    const { to, subject, html } = await req.json();

    if (!to || !subject || !html) {
      return NextResponse.json(
        { error: "Missing 'to', 'subject', or 'html' in request." },
        { status: 400 }
      );
    }

    const data = await sendEmail({ to, subject, html });

    return NextResponse.json({ id: data?.id });
  } catch (error: any) {
    console.error("[Email] Error sending email:", error);

    return NextResponse.json(
      { error: error?.message ?? "Failed to send email." },
      { status: 500 }
    );
  }
}