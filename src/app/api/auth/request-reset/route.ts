// src/app/api/auth/request-reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RESET_TOKEN_EXPIRY_MINUTES = 45;

export async function POST(req: NextRequest) {
  try {
    const body = ((await req.json().catch(() => ({}))) || {}) as {
      email?: string;
    };

    const emailRaw = body.email ?? "";
    const email = emailRaw.trim().toLowerCase();

    if (!email || !email.includes("@")) {
      // Always respond generic to avoid user enumeration
      return NextResponse.json({ ok: true });
    }

    const { prisma } = await import("@/lib/prisma");

    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Respond the same whether or not the user exists
    if (!user) {
      return NextResponse.json({ ok: true });
    }

    // Remove any existing tokens for this user
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id },
    });

    // Generate a raw token (sent to user)
    const rawToken = crypto.randomBytes(32).toString("hex");

    // Hash before storing (security best practice)
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiresAt = new Date(
      Date.now() + RESET_TOKEN_EXPIRY_MINUTES * 60_000
    );

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token: hashedToken,
        expiresAt,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(
      rawToken
    )}&email=${encodeURIComponent(email)}`;

    // TODO: Replace with real email provider (Resend/Postmark/etc.)
    // For now this logs so you can test in dev:
    console.log("📧 Password reset link (dev):", resetUrl);
    console.log("From: no-reply@avillo.io → To:", email);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("request-reset error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Unable to process password reset request.",
      },
      { status: 500 }
    );
  }
}