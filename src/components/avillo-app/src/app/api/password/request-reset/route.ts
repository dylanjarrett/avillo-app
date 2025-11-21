// src/app/api/password/request-reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    let body: { email?: string };

    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body." },
        { status: 400 }
      );
    }

    const email = body.email?.trim().toLowerCase();
    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    // Look up the user
    const user = (await prisma.user.findUnique({
      where: { email },
    } as any)) as any;

    // IMPORTANT: Do NOT reveal whether a user exists
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // Generate token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = await hash(rawToken, 10);
    const exp = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    // Store hashed token + expiry
    await prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: hashedToken,
        resetTokenExp: exp,
      } as any,
    });

    // TODO: send email using your provider (Resend, SendGrid, etc.)
    // For now we just log the URL so you can test manually:
    const resetUrl = `${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/reset-password?token=${encodeURIComponent(
      rawToken
    )}&email=${encodeURIComponent(email)}`;

    console.log("[Avillo] Password reset link:", resetUrl);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("password request-reset error:", err);
    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
} 
