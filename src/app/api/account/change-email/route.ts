// src/app/api/account/change-email/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compare } from "bcryptjs";
import { requireWorkspace } from "@/lib/workspace"; // <-- adjust path if needed

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ws = await requireWorkspace();
    if (!ws.ok) return NextResponse.json(ws.error, { status: ws.status });

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

    if (!newEmail.includes("@") || newEmail.length > 120) {
      return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: ws.userId } });

    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // Google-only / SSO-only user has no passwordHash
    if (!user.passwordHash) {
      return NextResponse.json(
        {
          error:
            "This account uses Google sign-in. Contact support@avillo.io to change your login email.",
        },
        { status: 400 }
      );
    }

    const isValidPassword = await compare(password, user.passwordHash);
    if (!isValidPassword) {
      return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
    }

    if (newEmail === user.email.toLowerCase()) {
      return NextResponse.json({ error: "That’s already your current email." }, { status: 400 });
    }

    const existing = await prisma.user.findUnique({ where: { email: newEmail } });
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

    return NextResponse.json(
      {
        success: true,
        message: "Email updated. Please sign in again with your new address.",
        requiresLogout: true,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("CHANGE EMAIL API ERROR →", err);
    return NextResponse.json(
      { error: "Something went wrong while updating your email." },
      { status: 500 }
    );
  }
}
