// src/app/api/auth/request-reset/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  let body: { email?: string } = {};

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const email = (body.email ?? "").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true },
    });

    // Don't reveal whether the email exists – return success either way
    if (!user) {
      return NextResponse.json({
        success: true,
        message: "If an account exists, a reset link will be sent.",
      });
    }

    // Clear any existing tokens for this identifier
    await prisma.verificationToken.deleteMany({
      where: { identifier: email },
    });

    const token = crypto.randomUUID();
    const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await prisma.verificationToken.create({
      data: {
        identifier: email,
        token,
        expires,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(
      token
    )}`;

    // TODO: wire up your actual email service here
    console.log("[password-reset-link]", resetUrl);

    return NextResponse.json({
      success: true,
      message: "If an account exists, a reset link will be sent.",
    });
  } catch (err) {
    console.error("request-reset error", err);
    return NextResponse.json(
      { error: "Something went wrong while requesting a reset." },
      { status: 500 }
    );
  }
}
