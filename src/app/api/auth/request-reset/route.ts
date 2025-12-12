// src/app/api/auth/request-reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { sendEmail } from "@/lib/resendClient";

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

    const baseUrl =
      process.env.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(
      rawToken
    )}&email=${encodeURIComponent(email)}`;

    // 🔐 Send real reset email via Resend helper
    try {
      await sendEmail({
        to: email,
        subject: "Reset your Avillo password",
        html: `
          <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #e5e7eb; background-color:#020617; padding:24px;">
            <div style="max-width:480px;margin:0 auto;border-radius:18px;border:1px solid #1f2937;padding:24px;background:#020617;">
              <h1 style="font-size:18px;font-weight:600;margin:0 0 12px;">Reset your Avillo password</h1>
              <p style="font-size:14px;line-height:1.5;margin:0 0 12px;">
                We received a request to reset the password for your Avillo account.
              </p>
              <p style="font-size:14px;line-height:1.5;margin:0 0 16px;">
                Click the button below to choose a new password. This link will expire in ${RESET_TOKEN_EXPIRY_MINUTES} minutes.
              </p>
              <p style="text-align:center;margin:0 0 18px;">
                <a href="http://${resetUrl}" style="display:inline-block;padding:10px 18px;border-radius:999px;background-color:#f4d26a;color:#020617;font-size:14px;font-weight:600;text-decoration:none;" target="_blank" rel="noopener">
                  Reset password
                </a>
              </p>
              <p style="font-size:12px;line-height:1.5;margin:0 0 8px;color:#9ca3af;">
                Or paste this link into your browser:
              </p>
              <p style="font-size:12px;line-height:1.5;margin:0 0 8px;color:#9ca3af;word-break:break-all;">
                ${resetUrl}
              </p>
              <p style="font-size:12px;line-height:1.5;margin:8px 0 0;color:#6b7280;">
                If you didn’t request this, you can safely ignore this email.
              </p>
            </div>
          </div>
        `,
        // let replies go to support@
        replyTo: "support@avillo.io",
      });
    } catch (emailErr) {
      console.error("Password reset Resend error:", emailErr);
      // We still return ok so UI isn't noisy and we don't leak existence of emails
    }

    // Still log for dev
    console.log("📧 Password reset link:", resetUrl);
    console.log("From no-reply@avillo.io → To:", email);

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