// src/app/api/account/change-email/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import authOptions from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: { newEmail?: string; password?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const newEmail = (body.newEmail ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!newEmail || !password) {
    return NextResponse.json(
      { error: "New email and current password are required." },
      { status: 400 }
    );
  }

  // Basic sanity check
  if (!newEmail.includes("@") || newEmail.length > 120) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 404 }
      );
    }

    if (!user.passwordHash) {
      // This keeps Google-only accounts from getting stuck
      return NextResponse.json(
        {
          error:
            "This account is linked to Google sign-in. Contact support@app.avillo.io to change your login email.",
        },
        { status: 400 }
      );
    }

    const isValidPassword = await compare(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json(
        { error: "Current password is incorrect." },
        { status: 400 }
      );
    }

    if (newEmail === user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "That’s already your current email." },
        { status: 400 }
      );
    }

    // Check for collisions
    const existing = await prisma.user.findUnique({
      where: { email: newEmail },
    });

    if (existing) {
      return NextResponse.json(
        {
          error:
            "That email is already in use. If you believe this is an error, contact support.",
        },
        { status: 400 }
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { email: newEmail },
    });

    // With JWT sessions the safest approach is to sign the user out
    return NextResponse.json({
      success: true,
      message: "Email updated. Please sign in again with your new address.",
      requiresLogout: true,
    });
  } catch (err) {
    console.error("change-email error", err);
    return NextResponse.json(
      { error: "Something went wrong while updating your email." },
      { status: 500 }
    );
  }
}