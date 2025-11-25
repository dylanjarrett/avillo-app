// src/app/api/auth/reset-password/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { hash } from "bcryptjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ResetBody = {
  email?: string;
  token?: string;
  newPassword?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = ((await req.json().catch(() => ({}))) || {}) as ResetBody;

    const emailRaw = body.email ?? "";
    const email = emailRaw.trim().toLowerCase();
    const token = (body.token ?? "").trim();
    const newPassword = body.newPassword ?? "";

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 }
      );
    }

    if (!token) {
      return NextResponse.json(
        { error: "Reset link is missing or invalid." },
        { status: 400 }
      );
    }

    if (!newPassword || newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long." },
        { status: 400 }
      );
    }

    const { prisma } = await import("@/lib/prisma");

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // Keep generic to avoid leaking which emails exist
      return NextResponse.json(
        { error: "Reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    // Hash the provided token the same way we stored it
    const hashedProvidedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const tokenRecord = await prisma.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        token: hashedProvidedToken,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { expiresAt: "desc" },
    });

    if (!tokenRecord) {
      return NextResponse.json(
        { error: "Reset link is invalid or has expired." },
        { status: 400 }
      );
    }

    const newHash = await hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Password updated. You can now sign in with your new password.",
    });
  } catch (err) {
    console.error("reset-password error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t reset your password right now. Try again or contact support@avillo.io.",
      },
      { status: 500 }
    );
  }
}